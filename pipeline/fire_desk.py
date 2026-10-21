"""Fire desk items: one per state, levelled on its ratio to the seasonal norm.

Step 6 of docs/severity-pipeline.md. Each run:

  1. Take the fire events (fire.py) of the last complete UTC day, which is
     always yesterday: NOAA-20 crosses India about 07-09 UTC (day pass) and
     19-21 UTC (night pass), so a UTC day is complete a few hours after
     21:00 UTC, before the next day's first run at 09:00 UTC. Today's events
     so far go into figures as a partial count and never set the level.
  2. Per state, the FIRMS-derived level:
       fire events / the state's norm for that calendar week
       (data/fire_baseline.csv, step 5), counted only at min_fire_events
       or more: >= level_2_min_ratio -> 2, >= level_3_min_ratio -> 3;
       a fire event with max FRP >= level_4_min_frp_mw within
       level_4_near_km of a place of level_4_min_population people -> 4.
     It is capped at calibration_cap until live counts are calibrated
     against the archive; the reason says when the cap lowers a level.
  3. A current GDACS wildfire alert located in the state lifts the item to
     gdacs_wildfire_level ("forest fire"), whatever the cap.
  4. Reconcile with the stored fire:<state> items: open at
     lifecycle.open_min_level, escalate or de-escalate, close only after
     close_after_hours of complete days below the open level (no fire
     events counts as below). If FIRMS failed, open items stay last-known.

Thresholds: severity.toml [fire]. Places: data/india_places.csv (GeoNames).
"""
import csv
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

import baseline
import desk
import fire

logger = logging.getLogger(__name__)

CATEGORY = "fire"
SOURCE = "FIRMS"
PRODUCT = "VIIRS NOAA-20 NRT"
PLACES_PATH = fire.DATA_DIR / "india_places.csv"


def item_id(state: str) -> str:
    """fire:<state slug>, e.g. fire:madhya-pradesh."""
    return f"{CATEGORY}:" + re.sub(r"[^a-z0-9]+", "-", state.lower()).strip("-")


def complete_day(now: datetime) -> date:
    """The last complete UTC day: yesterday (see the module docstring)."""
    return (now.astimezone(timezone.utc) - timedelta(days=1)).date()


def _day_text(d: date) -> str:
    return f"{d.day} {d:%b}"


def _count(n: int, word: str) -> str:
    return f"{n} {word}" + ("" if n == 1 else "s")


# --- inputs ----------------------------------------------------------------------------

@lru_cache(maxsize=1)
def load_places() -> tuple[tuple[str, float, float, int], ...]:
    """(name, lat, lon, population) for India's places of 15,000+ people."""
    with open(PLACES_PATH, newline="", encoding="utf-8") as f:
        return tuple((r["name"], float(r["latitude"]), float(r["longitude"]), int(r["population"]))
                     for r in csv.DictReader(f))


def large_fires_near_people(events: list[dict], places, cfg: dict) -> list[dict]:
    """Fire events at or above level_4_min_frp_mw within level_4_near_km of
    a place of level_4_min_population people, biggest fire first."""
    f = cfg["fire"]
    towns = [p for p in places if p[3] >= f["level_4_min_population"]]
    out = []
    for e in events:
        if e["frp_max"] < f["level_4_min_frp_mw"]:
            continue
        near = [(fire.haversine_km(e["latitude"], e["longitude"], lat, lon), name, pop)
                for name, lat, lon, pop in towns]
        near = [t for t in near if t[0] <= f["level_4_near_km"]]
        if near:
            km, name, pop = min(near)
            out.append({"fire_event": e["id"], "district": e["district"], "frp_max": e["frp_max"],
                        "place": name, "population": pop, "km": round(km, 1)})
    out.sort(key=lambda x: (-x["frp_max"], x["fire_event"]))
    return out


def wildfire_alerts_by_state(alerts: list[dict], districts, cfg: dict) -> tuple[dict[str, list[dict]], int]:
    """Current GDACS wildfire alerts by the state their point falls in.

    Returns ({state: [alert summary]}, alerts outside India's districts).
    """
    current = [a for a in alerts if a["eventtype"] == "WF" and a["iscurrent"]
               and a["latitude"] is not None and a["longitude"] is not None]
    excluded = set(cfg["fire"]["excluded_district_ids"])
    by_state, unmatched = defaultdict(list), 0
    for a, place in zip(current, districts.locate([(a["latitude"], a["longitude"]) for a in current])):
        if place is None or place["id"] in excluded:
            unmatched += 1
            continue
        by_state[place["state"]].append({
            "id": a["id"], "name": a["name"],
            "alert_level": a["episodealertlevel"] or a["alertlevel"],
            "from": a["fromdate"], "to": a["todate"], "url": a["url"],
        })
    return dict(by_state), unmatched


# --- one state -------------------------------------------------------------------------

def ratio_level(events: int, norm: float | None, cfg: dict) -> tuple[int, float | None, bool]:
    """(level, ratio, counted) for a day's fire events against the norm.

    counted: there is a norm and at least min_fire_events, so the ratio
    sets the level. A norm of 0 (no fires that week in the archive) gives
    ratio None and, once counted, the top ratio level.
    """
    f = cfg["fire"]
    if norm is None or events < f["min_fire_events"]:
        return 1, (events / norm if norm else None), False
    if norm == 0:
        return 3, None, True
    ratio = events / norm
    if ratio >= f["level_3_min_ratio"]:
        return 3, ratio, True
    if ratio >= f["level_2_min_ratio"]:
        return 2, ratio, True
    return 1, ratio, True


def _ratio_text(r: float) -> str:
    return f"{r:.2f}" if r < 10 else f"{r:.0f}"


def _norm_text(n: float) -> str:
    return f"{n:.0f}" if n >= 10 else f"{n:.1f}"


def state_candidate(state: str, events: list[dict], today_events: list[dict], norm: dict | None,
                    alerts: list[dict], *, cfg: dict, day: date, today: date, places,
                    gdacs_checked: bool, data_to: datetime | None) -> desk.Candidate:
    """The fire item for one state from its complete day's fire events."""
    f = cfg["fire"]
    n = len(events)
    mean = norm["mean_daily_events"] if norm else None
    r_level, ratio, counted = ratio_level(n, mean, cfg)
    near = large_fires_near_people(events, places, cfg)
    firms_level = max(r_level, 4 if near else 1)
    cap = f["calibration_cap"]
    gdacs_level = f["gdacs_wildfire_level"] if alerts else None
    level = max(min(firms_level, cap), gdacs_level or 1)
    capped = firms_level > level

    when = _day_text(day)
    if n == 0:
        firms_text = f"no fire events on {when}"
    elif mean is None:
        firms_text = f"{_count(n, 'fire event')} on {when}; no seasonal norm for {state}"
    elif not counted:
        firms_text = (f"{_count(n, 'fire event')} on {when}, too few to compare with the norm "
                      f"(minimum {f['min_fire_events']})")
    elif ratio is None:
        firms_text = f"{n} fire events on {when}; none in this week in {norm['years'].replace('-', '–')}"
    else:
        firms_text = f"{n} fire events on {when}, {_ratio_text(ratio)}× the seasonal norm ({_norm_text(mean)}/day)"
    if near:
        big = near[0]
        firms_text += f"; large fire ({big['frp_max']:.0f} MW) {big['km']:g} km from {big['place']}"
    parts = [firms_text]
    if alerts:
        a = alerts[0]
        parts.insert(0, f"forest fire: GDACS {a['alert_level']} wildfire alert ({a['name']})")
    reason = "; ".join(parts)
    reason = reason[0].upper() + reason[1:]
    if capped:
        reason += f" · capped at Level {cap} pending calibration (would be Level {firms_level})"

    districts = defaultdict(lambda: {"fire_events": 0, "hotspots": 0, "frp_max": 0.0})
    for e in events:
        d = districts[(e["district_id"], e["district"])]
        d["fire_events"] += 1
        d["hotspots"] += e["hotspot_count"]
        d["frp_max"] = max(d["frp_max"], e["frp_max"])
    district_list = sorted(({"district": name, "district_id": did, **v} for (did, name), v in districts.items()),
                           key=lambda d: (-d["fire_events"], d["district"]))

    k = len(district_list)
    if k:
        title = f"Fire activity in {k} {state} district" + ("" if k == 1 else "s")
    elif alerts:
        title = f"Forest fire in {state}"
    else:
        title = f"No fire activity in {state}"

    if events:
        lat = round(sum(e["latitude"] for e in events) / n, 4)
        lon = round(sum(e["longitude"] for e in events) / n, 4)
    else:
        lat = lon = None

    return desk.Candidate(
        id=item_id(state), category=CATEGORY, source=SOURCE, source_ref=None,
        title=title, place_name=state, latitude=lat, longitude=lon,
        level=level, reason=reason, observed_at=data_to, source_updated_at=data_to,
        figures={
            "state": state,
            "day": day.isoformat(),
            "week": baseline.week_of(day),
            "fire_events": n,
            "hotspots": sum(e["hotspot_count"] for e in events),
            "district_count": k,
            "districts": district_list,
            "norm_daily_events": mean,
            "norm_max_daily_events": norm["max_daily_events"] if norm else None,
            "norm_years": norm["years"] if norm else None,
            "ratio_to_norm": round(ratio, 3) if ratio is not None else None,
            "min_fire_events": f["min_fire_events"],
            "ratio_counted": counted,
            "ratio_level": r_level,
            "large_fires_near_people": near[:5],
            "firms_level": firms_level,
            "calibration_cap": cap,
            "capped": capped,
            "gdacs_wildfire": alerts,
            "gdacs_level": gdacs_level,
            "gdacs_checked": gdacs_checked,
            "quiet_since": None,
            "data_to": data_to.isoformat() if data_to else None,
            "product": PRODUCT,
            "today": {
                "date": today.isoformat(),
                "partial": True,
                "fire_events": len(today_events),
                "hotspots": sum(e["hotspot_count"] for e in today_events),
                "district_count": len({e["district_id"] for e in today_events}),
            },
        },
    )


# --- lifecycle --------------------------------------------------------------------------

def start_quiet_clock(candidates: list[desk.Candidate], existing: dict[str, dict], day: date, cfg: dict) -> None:
    """figures.quiet_since: the first complete day an open item spent below
    the open level, carried over from the stored item."""
    open_min = cfg["fire"]["lifecycle"]["open_min_level"]
    for c in candidates:
        old = existing.get(c.id)
        if c.level >= open_min or old is None or old["status"] != "open":
            continue
        c.figures["quiet_since"] = (old.get("figures") or {}).get("quiet_since") or day.isoformat()


def quiet_hours(candidate: desk.Candidate, day: date) -> int:
    """Hours of complete days the item has been below the open level, up to and including day."""
    since = candidate.figures.get("quiet_since")
    if not since:
        return 0
    return ((day - date.fromisoformat(since)).days + 1) * 24


def build_candidates(day_rows: list[dict], today_rows: list[dict], alerts: dict[str, list[dict]],
                     existing: dict[str, dict], *, cfg: dict, day: date, today: date, norms: dict, places,
                     gdacs_checked: bool, data_to: datetime | None) -> list[desk.Candidate]:
    """One candidate per state with fire events on day, a wildfire alert, or an open item.

    day_rows / today_rows: fire_events rows of the complete day and of today.
    alerts: {state: [alert summary]}; when GDACS was not checked this run,
    open items keep their last known alerts.
    """
    by_state, by_state_today = defaultdict(list), defaultdict(list)
    for r in day_rows:
        by_state[r["state"]].append(r)
    for r in today_rows:
        by_state_today[r["state"]].append(r)
    open_states = {(i.get("figures") or {}).get("state") or i["place_name"]: i
                   for i in existing.values() if i["status"] == "open" and i["category"] == CATEGORY}
    alerts = dict(alerts)
    if not gdacs_checked:
        for state, item in open_states.items():
            if (item.get("figures") or {}).get("gdacs_wildfire"):
                alerts[state] = item["figures"]["gdacs_wildfire"]
    week = baseline.week_of(day)
    candidates = [
        state_candidate(state, by_state.get(state, []), by_state_today.get(state, []), norms.get((state, week)),
                        alerts.get(state, []), cfg=cfg, day=day, today=today, places=places,
                        gdacs_checked=gdacs_checked, data_to=data_to)
        for state in sorted(set(by_state) | set(alerts) | set(open_states))
    ]
    start_quiet_clock(candidates, existing, day, cfg)
    return candidates


def reconcile_items(existing: dict[str, dict], candidates: list[desk.Candidate], *, cfg: dict, day: date,
                    now: datetime, run_id: int | None, note: str | None = None) -> tuple[list[dict], list[dict]]:
    """desk.reconcile with the fire lifecycle. note: why there are no new
    levels this run (FIRMS failed); open items then stay last-known."""
    lifecycle = cfg["fire"]["lifecycle"]
    return desk.reconcile(
        existing, candidates, categories={CATEGORY}, source_good=note is None,
        open_min_level=lifecycle["open_min_level"], expired=lambda item: False, now=now,
        run_id=run_id, last_known_note=note,
        closes=lambda c, old: quiet_hours(c, day) >= lifecycle["close_after_hours"])


# --- stage ------------------------------------------------------------------------------

def run_fire_desk(supabase, run_id: int | None, results: dict, now: datetime, *, rows: list[dict] | None = None,
                  write: bool = True, cfg: dict | None = None, norms: dict | None = None,
                  districts=None, places=None) -> dict:
    """Build, reconcile and (if write) store the per-state fire items.

    rows: this run's fire_events rows from the fire stage; rebuilt from the
    FIRMS fetch when None (the fire stage failed after fetching).
    """
    cfg = cfg or desk.severity_config.load()
    day = complete_day(now)
    today = now.astimezone(timezone.utc).date()
    firms, gdacs = results["FIRMS"], results.get("GDACS")
    gdacs_good = gdacs is not None and gdacs.status == "ok"

    note, day_spots = None, []
    if firms.status == "empty":
        note = "FIRMS returned no hotspots this run"
    elif firms.status != "ok":
        note = "FIRMS fetch failed this run"
    else:
        day_spots = [r for r in firms.rows if (r.get("raw") or {}).get("acq_date") == day.isoformat()]
        if not day_spots:
            note = f"no FIRMS data for {_day_text(day)} in this run"

    day_rows, today_rows, alerts, unmatched = [], [], {}, 0
    if note is None:
        districts = districts or fire.Districts.india()
        if rows is None:
            rows = fire.run_fire(supabase, run_id, results, now, write=False, cfg=cfg, districts=districts)["rows"]
        day_rows = [r for r in rows if r["acq_date"] == day.isoformat()]
        today_rows = [r for r in rows if r["acq_date"] == today.isoformat()]
        if gdacs_good:
            alerts, unmatched = wildfire_alerts_by_state(gdacs.extras.get("alerts", []), districts, cfg)

    try:
        ids = {item_id(r["state"]) for r in day_rows} | {item_id(s) for s in alerts}
        existing = desk.load_items(supabase, {CATEGORY}, sorted(ids))
    except Exception as exc:
        if write:
            raise
        logger.warning("dry-run: could not read desk items — %s", exc)
        existing = {}

    candidates = []
    if note is None:
        times = [t for r in day_spots if (t := desk._dt(r.get("started_at")))]
        candidates = build_candidates(
            day_rows, today_rows, alerts, existing, cfg=cfg, day=day, today=today,
            norms=norms if norms is not None else baseline.load(),
            places=places if places is not None else load_places(),
            gdacs_checked=gdacs_good, data_to=max(times) if times else None)

    items, snapshots = reconcile_items(existing, candidates, cfg=cfg, day=day, now=now, run_id=run_id, note=note)
    if write:
        desk.store(supabase, items, snapshots)

    open_items = sorted((i for i in items if i["status"] == "open"), key=lambda i: (-i["severity_level"], i["id"]))
    ranked = sorted((c for c in candidates if c.figures["ratio_counted"] and c.figures["ratio_to_norm"] is not None),
                    key=lambda c: -c.figures["ratio_to_norm"])
    return {
        "day": day.isoformat(),
        "source_good": note is None,
        "note": note,
        "assessed": len(candidates),
        "open": [f"{i['place_name']} L{i['severity_level']}" + (" capped" if (i.get("figures") or {}).get("capped") else "")
                 + (" last-known" if i["last_known"] else "") for i in open_items],
        "max_level": max((i["severity_level"] for i in open_items), default=None),
        "changes": {s["item_id"]: s["change"] for s in snapshots if s["change"]},
        "top_ratios": [f"{c.place_name} {c.figures['fire_events']}/{c.figures['norm_daily_events']:.1f} "
                       f"= {c.figures['ratio_to_norm']:.2f}x" for c in ranked[:5]],
        "unmatched_alerts": unmatched,
    }
