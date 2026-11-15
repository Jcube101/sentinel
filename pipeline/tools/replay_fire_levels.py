"""Replay the fire desk over the FIRMS archive to test threshold changes.

Runs the live code (fire.build_events, fire_desk.build_candidates and
reconcile_items) once per archive day, as the first run after that day, and
reports how often each state reaches each level and how many fire items the
desk would hold. Nothing is written. From pipeline/ (~1 min on the Pi):

    PYTHONPATH=. .venv/bin/python tools/replay_fire_levels.py \\
        --cache-dir /home/jcube/projects/sentinel-data/firms_sp
    PYTHONPATH=. .venv/bin/python tools/replay_fire_levels.py \\
        --cache-dir /home/jcube/projects/sentinel-data/firms_sp \\
        --set fire.min_fire_events=30 --set fire.level_2_min_ratio=2.5

--set changes one severity.toml value for this replay only (value in TOML
syntax); --config replays another copy of the file. Caveats:
  - In-sample: the norms (data/fire_baseline.csv) come from the same archive
    days, so live levels will be somewhat noisier.
  - Thresholds only: changing the mask, clustering or confidence needs a
    baseline rebuild (tools/build_fire_baseline.py) to stay comparable.
  - GDACS wildfire alerts and today's partial count are not replayed.

--trailing N replays each year with norms from the N years before it, the way the live desk works
(a norm can only come from the past): unlike --leave-one-out it is not flattered or hurt by a trend.
--leave-one-out (15 Nov 2026) replays each baseline year with norms built from the OTHER years only,
so the rates are out of sample: "what would a normal year have looked like". --nrt-archive replays
the live NRT hotspots in sentinel_archive.db (the only out-of-sample year there is) with the
norms of data/fire_baseline.csv.
"""
import argparse
import copy
import logging
import sys
import time as clock
import tomllib
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import baseline
import fire
import fire_desk
from severity_config import ConfigError, load, validate

logger = logging.getLogger("replay_fire_levels")


def apply_override(cfg: dict, assignment: str) -> None:
    """'fire.min_fire_events=30' -> cfg["fire"]["min_fire_events"] = 30 (existing keys only)."""
    key, sep, value = assignment.partition("=")
    if not sep:
        raise ConfigError(f"--set {assignment!r}: expected key=value")
    try:
        parsed = tomllib.loads(f"v = {value.strip()}")["v"]
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"--set {assignment!r}: {exc}") from None
    *parents, leaf = key.strip().split(".")
    node = cfg
    for part in parents:
        node = node.get(part) if isinstance(node, dict) else None
    if not isinstance(node, dict) or leaf not in node:
        raise ConfigError(f"--set {assignment!r}: no such key in severity.toml")
    node[leaf] = parsed


def archive_days(cache_dir: Path, years: list[int], cfg: dict, districts, mask):
    """Yield (day, fire_events rows) for every day the archive has data for, in order."""
    keep = set(cfg["fire"]["confidence"])
    now = datetime.now(timezone.utc)
    for path in sorted(cache_dir.glob("*.csv.gz")):
        if int(path.name[:4]) not in years:
            continue
        covered, by_day = set(), defaultdict(list)
        for row in baseline.read_chunk(path):
            covered.add(row["acq_date"])
            if baseline.firms_type(row) != 0:
                continue
            spot = baseline.to_hotspot(row)
            if spot is not None and spot.confidence in keep and not mask.masks(spot.lat, spot.lon):
                by_day[spot.acq_date].append(spot)
        for day in sorted(d for d in covered if int(d[:4]) in years):
            yield date.fromisoformat(day), fire.build_events(by_day.get(day, []), cfg, districts, None, now)


def replay(days, cfg: dict, norms: dict, places) -> dict:
    """Run the fire desk once per day; collect level and desk statistics."""
    existing = {}
    firms_days = defaultdict(Counter)    # state -> Counter(FIRMS-derived level, uncapped)
    opened = Counter()                   # state -> items opened or reopened
    days_open = Counter()                # state -> days with an open item
    open_per_day, busiest, level4 = [], [], []
    episodes, started = [], {}
    n_days = 0
    l3_days = l4_days = 0          # state-days at FIRMS level 3 / 4, before any cap
    closed_on, reopen_gaps = {}, []
    for day, rows in days:
        n_days += 1
        now = datetime.combine(day + timedelta(days=1), time(9), timezone.utc)
        candidates = fire_desk.build_candidates(rows, [], {}, existing, cfg=cfg, day=day, today=day + timedelta(days=1),
                                                norms=norms, places=places, gdacs_checked=True, data_to=None)
        items, snapshots = fire_desk.reconcile_items(existing, candidates, cfg=cfg, day=day, now=now, run_id=None)
        existing.update({i["id"]: i for i in items})
        for c in candidates:
            if c.figures["fire_events"]:
                firms_days[c.place_name][c.figures["firms_level"]] += 1
                l3_days += c.figures["firms_level"] >= 3
                l4_days += c.figures["firms_level"] >= 4
            for big in c.figures["large_fires_near_people"][:1]:
                level4.append((day, c.place_name, big["district"], big["frp_max"], big["place"], big["km"]))
        for s in snapshots:
            state = s["figures"].get("state")
            if s["change"] in ("opened", "reopened"):
                opened[state] += 1
                started[state] = day
                if state in closed_on:
                    reopen_gaps.append((day - closed_on.pop(state)).days)
            elif s["change"] == "closed":
                episodes.append((day - started.pop(state, day)).days)
                closed_on[state] = day
        now_open = sorted(i["place_name"] for i in existing.values() if i["status"] == "open")
        days_open.update(now_open)
        open_per_day.append(len(now_open))
        busiest.append((len(now_open), day, now_open))
    return {"days": n_days, "firms_days": firms_days, "opened": opened, "days_open": days_open,
            "open_per_day": open_per_day, "busiest": sorted(busiest, key=lambda b: (-b[0], b[1]))[:3],
            "level4": level4, "episodes": episodes, "l3_days": l3_days, "l4_days": l4_days,
            "reopen_gaps": reopen_gaps}


def report(r: dict, cfg: dict, years: list[int]) -> None:
    f, lc = cfg["fire"], cfg["fire"]["lifecycle"]
    days, per_day = r["days"], sorted(r["open_per_day"])
    print(f"\nFire desk replay, {years[0]}-{years[-1]}: {days} archive days (in-sample norms; GDACS not replayed)")
    print(f"min_fire_events={f['min_fire_events']}  level_2_min_ratio={f['level_2_min_ratio']}  "
          f"level_3_min_ratio={f['level_3_min_ratio']}  ratio_level_cap={f['ratio_level_cap']}  near_people_cap={f['near_people_cap']}  "
          f"Level 4: {f['level_4_min_frp_mw']} MW within {f['level_4_near_km']} km of "
          f"{f['level_4_min_population']:,}+ people  open at L{lc['open_min_level']}, "
          f"close after {lc['close_after_hours']} h below")
    if not days:
        print("No archive days in range.")
        return
    years_n = days / 365.25
    print(f"\nDesk: fire items open per day: mean {sum(per_day) / days:.1f}, median {per_day[days // 2]}, "
          f"p90 {per_day[int(days * 0.9)]}, max {per_day[-1]}")
    episodes = r["episodes"]
    mean_len = f", mean {sum(episodes) / len(episodes):.1f} days open" if episodes else ""
    print(f"      items opened: {sum(r['opened'].values()) / years_n:.0f} a year{mean_len}")
    for n, day, states in r["busiest"]:
        print(f"      busiest: {day} with {n} open: {', '.join(states)}")

    print(f"\n{'state':22s}{'opened/yr':>10s}{'days open':>10s}   days at FIRMS level (uncapped) 2 / 3 / 4")
    rows = sorted(r["firms_days"], key=lambda s: (-r["days_open"][s], s))
    for state in rows:
        c = r["firms_days"][state]
        if r["days_open"][state] or c[2] or c[3] or c[4]:
            print(f"{state:22s}{r['opened'][state] / years_n:10.0f}{r['days_open'][state]:10d}   "
                  f"{c[2]:5d} {c[3]:5d} {c[4]:5d}")

    print(f"\nLevel 4 (large fire near people): {len(r['level4'])} state-days")
    for day, state, district, frp, place, km in r["level4"]:
        print(f"  {day}  {state} ({district}): {frp:.0f} MW, {km:g} km from {place}")


def summary(r: dict, label: str, years_n: float | None = None) -> dict:
    """The numbers a threshold decision needs, from one replay."""
    days, per_day = r["days"], r["open_per_day"]
    years_n = years_n or days / 365.25
    gaps = r["reopen_gaps"]
    return {
        "label": label, "days": days,
        "open_per_day": sum(per_day) / max(days, 1),
        "max_open": max(per_day, default=0),
        "opens_per_year": sum(r["opened"].values()) / years_n,
        "l3_per_day": r["l3_days"] / max(days, 1), "l4_state_days": r["l4_days"],
        "reopens": len(gaps), "reopen_within_3d": sum(1 for g in gaps if g <= 3),
    }


def print_summaries(rows: list[dict], title: str) -> None:
    print(f"\n{title}")
    print(f"{'':16s}{'days':>6s}{'open/day':>9s}{'max':>5s}{'opens/yr':>9s}{'L3+/day':>9s}{'L4 days':>8s}{'reopens':>8s}{'<=3 d':>6s}")
    for x in rows:
        print(f"{x['label']:16s}{x['days']:6d}{x['open_per_day']:9.2f}{x['max_open']:5d}{x['opens_per_year']:9.0f}"
              f"{x['l3_per_day']:9.3f}{x['l4_state_days']:8d}{x['reopens']:8d}{x['reopen_within_3d']:6d}")


def daily_counts(cache_dir: Path, year: int, cfg: dict, districts, mask):
    """({(state, day): [events, hotspots]}, days the archive covers) for one year, counted like the baseline."""
    keep = set(cfg["fire"]["confidence"])
    daily, covered = {}, set()
    for path in sorted(cache_dir.glob(f"{year}-*.csv.gz")):
        by_day = defaultdict(list)
        for row in baseline.read_chunk(path):
            covered.add(row["acq_date"])
            if baseline.firms_type(row) != 0:
                continue
            spot = baseline.to_hotspot(row)
            if spot is not None and spot.confidence in keep:
                by_day[spot.acq_date].append(spot)
        for day, spots in by_day.items():
            for state, value in baseline.count_day(spots, cfg, districts, mask).items():
                daily[(state, date.fromisoformat(day))] = value
    return daily, {date.fromisoformat(d) for d in covered}


def norms_from(per_year: dict, use: list[int], years: list[int], cfg: dict, states: list[str]) -> dict:
    daily = {k: v for y in use for k, v in per_year[y][0].items()}
    covered = set().union(*(per_year[y][1] for y in use))
    rows = baseline.aggregate(daily, states, date(years[0], 1, 1), date(years[-1], 12, 31),
                              cfg["fire"]["baseline"]["smooth_weeks"], "+".join(map(str, use)), covered=covered)
    return {(r["state"], r["week"]): r for r in rows}


def leave_one_out(cache_dir: Path, years: list[int], cfg: dict, districts, mask, places, trailing: int | None = None) -> list[dict]:
    """Replay each year with norms from the other years (a normal year, out of sample), or with
    trailing=N from the N years before it (only years that have N before them)."""
    per_year = {y: daily_counts(cache_dir, y, cfg, districts, mask) for y in years}
    states = sorted({p["state"] for p in districts.props})
    out = []
    for held in years:
        rest = [y for y in years if y != held] if trailing is None else [y for y in years if held - trailing <= y < held]
        if trailing is not None and len(rest) < trailing:
            continue
        norms = norms_from(per_year, rest, years, cfg, states)
        t0 = clock.monotonic()
        result = replay(archive_days(cache_dir, [held], cfg, districts, mask), cfg, norms, places)
        logger.info("held out %d: %d days in %.0f s", held, result["days"], clock.monotonic() - t0)
        out.append(summary(result, f"{held} ({rest[0]}-{rest[-1]})" if trailing else str(held)))
    return out


def nrt_days(archive: Path, first: date, last: date, cfg: dict, districts, mask):
    """(day, fire_events rows) from the live NRT hotspots kept in the local archive, for days FIRMS held completely."""
    import json
    import sqlite3
    keep = set(cfg["fire"]["confidence"])
    by_day = defaultdict(list)
    with sqlite3.connect(f"file:{archive}?mode=ro", uri=True) as db:
        for (raw,) in db.execute("select raw from events where source='FIRMS' and started_at >= ?", (first.isoformat(),)):
            spot = baseline.to_hotspot(json.loads(raw))
            if spot is not None and spot.confidence in keep and not mask.masks(spot.lat, spot.lon):
                by_day[spot.acq_date].append(spot)
    now = datetime.now(timezone.utc)
    day = first
    while day <= last:
        yield day, fire.build_events(by_day.get(day.isoformat(), []), cfg, districts, None, now)
        day += timedelta(days=1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache-dir", type=Path, required=True, help="archive chunks from tools/pull_firms_archive.py")
    parser.add_argument("--config", type=Path, help="severity.toml to replay (default: the repo's)")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                        help="override one value, e.g. fire.min_fire_events=30 (repeatable)")
    parser.add_argument("--years", type=int, nargs="+", help="archive years (default: fire.baseline.years)")
    parser.add_argument("--leave-one-out", action="store_true",
                        help="replay each year with norms from the other years only (out of sample)")
    parser.add_argument("--trailing", type=int, metavar="N",
                        help="replay each year with norms from the N years before it (instead of the other years)")
    parser.add_argument("--nrt-norm-years", type=int, nargs="+", metavar="YEAR",
                        help="for --nrt-archive: build the norms from these archive years instead of using data/fire_baseline.csv")
    parser.add_argument("--nrt-archive", type=Path, metavar="SQLITE",
                        help="also replay the live NRT hotspots in this archive (norms: data/fire_baseline.csv)")
    parser.add_argument("--nrt-from", type=date.fromisoformat, default=date(2026, 7, 24),
                        help="first NRT day to replay (default 2026-07-24: the archive has gaps before)")
    parser.add_argument("--nrt-to", type=date.fromisoformat, default=date(2026, 11, 14))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")

    try:
        cfg = copy.deepcopy(load(args.config) if args.config else load())
        for assignment in args.set:
            apply_override(cfg, assignment)
        validate(cfg)
    except ConfigError as exc:
        parser.error(str(exc))
    years = sorted(args.years or cfg["fire"]["baseline"]["years"])

    t0 = clock.monotonic()
    districts = fire.Districts.india()
    mask = fire.StaticMask.load(fire.STATIC_MASK_PATH, cfg["fire"]["static_mask"]["neighbour_cells"])
    if args.leave_one_out or args.trailing or args.nrt_archive:
        f = cfg["fire"]
        print(f"min_fire_events={f['min_fire_events']}  level_2_min_ratio={f['level_2_min_ratio']}  "
              f"level_3_min_ratio={f['level_3_min_ratio']}  close after {f['lifecycle']['close_after_hours']} h  "
              f"(L3+/L4: the FIRMS level before any cap)")
        places = fire_desk.load_places()
        if args.leave_one_out or args.trailing:
            rows = leave_one_out(args.cache_dir, years, cfg, districts, mask, places, args.trailing)
            n = len(rows)
            rows.append({"label": "mean", "days": sum(x["days"] for x in rows),
                         **{k: sum(x[k] for x in rows) / n for k in ("open_per_day", "opens_per_year", "l3_per_day")},
                         "max_open": max(x["max_open"] for x in rows), "l4_state_days": sum(x["l4_state_days"] for x in rows),
                         "reopens": sum(x["reopens"] for x in rows), "reopen_within_3d": sum(x["reopen_within_3d"] for x in rows)})
            print_summaries(rows, f"Trailing {args.trailing}-year norms, years {years[0]}-{years[-1]}" if args.trailing
                            else f"Leave-one-year-out, years {years[0]}-{years[-1]} (norms from the other years)")
        if args.nrt_archive:
            norms = baseline.load()
            if args.nrt_norm_years:
                per_year = {y: daily_counts(args.cache_dir, y, cfg, districts, mask) for y in args.nrt_norm_years}
                norms = norms_from(per_year, args.nrt_norm_years, sorted(args.nrt_norm_years), cfg,
                                   sorted({p["state"] for p in districts.props}))
            result = replay(nrt_days(args.nrt_archive, args.nrt_from, args.nrt_to, cfg, districts, mask), cfg,
                            norms, places)
            print_summaries([summary(result, f"live {args.nrt_from:%d %b}-{args.nrt_to:%d %b}")],
                            "Live NRT archive, norms from data/fire_baseline.csv (out of sample)")
        return 0
    result = replay(archive_days(args.cache_dir, years, cfg, districts, mask), cfg, baseline.load(),
                    fire_desk.load_places())
    logger.info("replayed %d days in %.0f s", result["days"], clock.monotonic() - t0)
    report(result, cfg, years)
    return 0


if __name__ == "__main__":
    sys.exit(main())
