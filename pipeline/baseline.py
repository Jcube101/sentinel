"""Seasonal fire baseline: what is normal for a state in a given week.

Built once from the FIRMS VIIRS NOAA-20 standard-processing archive by
tools/build_fire_baseline.py, which writes:

  data/static_heat_cells.json  the static heat-source mask (fire.StaticMask)
  data/fire_baseline.csv       mean daily fire events per state per week,
                               also uploaded to the fire_baseline table

Archive fires are counted exactly like live fire_events: nominal/high
confidence, vegetation fires only (archive type 0), minus the mask,
clustered per UTC day, placed in districts, excluded districts dropped.
Step 6 compares a state's live daily count with its norm for the week.
"""
import csv
import gzip
import math
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import fire

BASELINE_PATH = fire.DATA_DIR / "fire_baseline.csv"
NATIONAL = "India"
WEEKS = 52
COLUMNS = ("state", "week", "mean_daily_events", "mean_daily_events_week",
           "mean_daily_hotspots", "max_daily_events", "days", "years")


def week_of(d: date) -> int:
    """Calendar week 1-52: (day of year - 1) // 7 + 1; days 358-366 fold into 52."""
    return min((d.timetuple().tm_yday - 1) // 7 + 1, WEEKS)


# --- archive rows -----------------------------------------------------------------------------

def read_chunk(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def to_hotspot(row: dict) -> fire.Hotspot | None:
    """Archive CSV row -> Hotspot, with the same id scheme as the live fetcher."""
    try:
        lat, lon = float(row["latitude"]), float(row["longitude"])
        acq_date, acq_time = row["acq_date"], row["acq_time"]
        when = datetime.strptime(f"{acq_date} {acq_time.zfill(4)}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
        return fire.Hotspot(f"FIRMS-{lat}-{lon}-{acq_date}-{acq_time}", lat, lon, acq_date, when,
                            float(row.get("frp") or 0), (row.get("confidence") or "").strip().lower())
    except (KeyError, TypeError, ValueError):
        return None


def firms_type(row: dict) -> int | None:
    try:
        return int(row.get("type", ""))
    except ValueError:
        return None


# --- static heat-source mask ---------------------------------------------------------------------

def count_static_cells(rows, types: set[int], cell_deg: float, counts: dict | None = None) -> dict:
    """Add archive detections of the given types to per-cell counts."""
    counts = counts if counts is not None else defaultdict(int)
    for row in rows:
        if firms_type(row) in types:
            try:
                lat, lon = float(row["latitude"]), float(row["longitude"])
            except (KeyError, ValueError):
                continue
            counts[(math.floor(lat / cell_deg), math.floor(lon / cell_deg))] += 1
    return counts


def mask_cells(counts: dict, min_detections: int) -> set[tuple[int, int]]:
    return {cell for cell, n in counts.items() if n >= min_detections}


# --- daily counts and the weekly norm ---------------------------------------------------------------

def count_day(spots: list[fire.Hotspot], cfg: dict, districts, mask) -> dict[str, list[int]]:
    """One UTC day's spots -> {state: [fire events, hotspots]}, counted like live fire_events."""
    kept = [s for s in spots if not mask.masks(s.lat, s.lon)]
    out = defaultdict(lambda: [0, 0])
    for row in fire.build_events(kept, cfg, districts, None, datetime.now(timezone.utc)):
        out[row["state"]][0] += 1
        out[row["state"]][1] += row["hotspot_count"]
    return dict(out)


def aggregate(daily: dict[tuple[str, date], list[int]], states: list[str], start: date, end: date,
              smooth_weeks: int, years_label: str, covered: set[date] | None = None) -> list[dict]:
    """Per (state, week) norms from daily counts; days without fires count as 0.

    daily:   {(state, day): [events, hotspots]} for every day with fires.
    covered: days the archive has data for (default: every day). Days it
             lacks entirely (a product gap, e.g. 2024-02-04) are left out
             of the averages instead of counting as fire-free.
    A national row (state "India") sums all states.
    """
    days_in_week = defaultdict(int)
    d = start
    while d <= end:
        if covered is None or d in covered:
            days_in_week[week_of(d)] += 1
        d += timedelta(days=1)

    national = defaultdict(lambda: [0, 0])
    for (state, day), (events, hotspots) in daily.items():
        national[day][0] += events
        national[day][1] += hotspots
    series = dict(daily)
    series.update({(NATIONAL, day): v for day, v in national.items()})

    events_sum = defaultdict(int)
    hotspots_sum = defaultdict(int)
    daily_max = defaultdict(int)
    for (state, day), (events, hotspots) in series.items():
        key = (state, week_of(day))
        events_sum[key] += events
        hotspots_sum[key] += hotspots
        daily_max[key] = max(daily_max[key], events)

    rows = []
    for state in sorted(states) + [NATIONAL]:
        for week in range(1, WEEKS + 1):
            window = [((week - 1 + k) % WEEKS) + 1 for k in range(-smooth_weeks, smooth_weeks + 1)]
            days = sum(days_in_week[w] for w in window)
            if not days:
                continue
            rows.append({
                "state": state,
                "week": week,
                "mean_daily_events": round(sum(events_sum[(state, w)] for w in window) / days, 4),
                "mean_daily_events_week": round(events_sum[(state, week)] / days_in_week[week], 4)
                if days_in_week[week] else 0.0,
                "mean_daily_hotspots": round(sum(hotspots_sum[(state, w)] for w in window) / days, 4),
                "max_daily_events": max(daily_max[(state, w)] for w in window),
                "days": days,
                "years": years_label,
            })
    return rows


def write_csv(rows: list[dict], path: Path = BASELINE_PATH) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def load(path: Path = BASELINE_PATH) -> dict[tuple[str, int], dict]:
    """{(state, week): row} with numeric fields parsed."""
    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            row["week"] = int(row["week"])
            for k in ("mean_daily_events", "mean_daily_events_week", "mean_daily_hotspots"):
                row[k] = float(row[k])
            row["max_daily_events"], row["days"] = int(row["max_daily_events"]), int(row["days"])
            out[(row["state"], row["week"])] = row
    return out
