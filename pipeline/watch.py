"""Quiet-day desk: the watching list and per-category status (step 7).

Runs after the severity stages. Each stage hands over its watch subjects
(desk.WatchSubject: a value measured against the threshold of its next
level) and its desk items. This module:

  1. updates desk_watch. A subject's trend gets a point only when its
     source has new data, so "rising" counts source updates, not runs
     (FIRMS-based fire subjects move once per complete day). A subject is
     watching when it is within [watching] margin of the threshold, or has
     moved toward it for rising_updates updates in a row once it is at least
     rising_min_progress of the way there.
  2. writes a category_status row per category for this run: highest open
     level (or none open), a one-line summary, the source and its status.

The 14-day strip (daily max level) and days since the last Level 3+ are
views over desk_item_snapshots. Schema: migrations/005_quiet_day.sql.
Thresholds: severity.toml [watching].
"""
import logging
from datetime import datetime, timedelta

import desk
import severity_config

logger = logging.getLogger(__name__)

WATCH_TABLE = "desk_watch"
WATCH_SNAPSHOTS_TABLE = "desk_watch_snapshots"
STATUS_TABLE = "category_status"
TREND_POINTS = 10
BATCH_SIZE = 500
CATEGORIES = ("earthquake", "flood", "cyclone", "fire", "air")
# category -> (pipeline results key, sources.id, the stage that levels it)
CATEGORY_SOURCES = {
    "earthquake": ("USGS", "USGS", "desk"),
    "flood": ("GDACS", "GDACS", "desk"),
    "cyclone": ("GDACS", "GDACS", "desk"),
    "fire": ("FIRMS", "FIRMS", "fire_desk"),
    "air": ("OpenAQ", "OPENAQ", "air"),
}


# --- watching -----------------------------------------------------------------------------

def _progress(point: dict) -> float | None:
    """value as a fraction of the threshold (the raw value when there is none)."""
    value, threshold = point.get("value"), point.get("threshold")
    if value is None:
        return None
    return value / threshold if threshold else value


def rising_streak(trend: list[dict], next_level: int | None) -> int:
    """Source updates in a row, ending with the latest, that moved toward the
    threshold of the same next level."""
    streak = 0
    for prev, cur in zip(reversed(trend[:-1]), reversed(trend[1:])):
        if prev.get("next_level") != next_level or cur.get("next_level") != next_level:
            break
        p, c = _progress(prev), _progress(cur)
        if p is None or c is None or c <= p:
            break
        streak += 1
    return streak


def _below_text(distance: float) -> str:
    if distance == 0:
        return "at"
    return "under 1% below" if distance < 0.01 else f"{distance:.0%} below"


def update_row(subject: desk.WatchSubject, stored: dict | None, cfg: dict, now: datetime,
               run_id: int | None) -> dict:
    """The desk_watch row for a subject this run, building on its stored row."""
    w = cfg["watching"]
    trend = list((stored or {}).get("trend") or [])
    if subject.keep_point is not None:
        trend = [p for p in trend if subject.keep_point(p)]
    stored_at = desk._dt((stored or {}).get("source_updated_at"))
    at = subject.source_updated_at
    if stored is None or (at is not None and (stored_at is None or at > stored_at)):
        trend.append({"at": at.isoformat() if at else None, "value": subject.value,
                      "threshold": subject.threshold, "next_level": subject.next_level})
        trend = trend[-TREND_POINTS:]

    value, threshold, next_level = subject.value, subject.threshold, subject.next_level
    streak = rising_streak(trend, next_level)
    distance = (threshold - value) / threshold if threshold and value is not None else None
    # Past the threshold without the level: today only a Severe air reading
    # still waiting for confirmation (air.severe_confirm_runs).
    past = distance is not None and distance < 0
    near = distance is not None and 0 <= distance <= w["margin"]
    far_enough = threshold is None or (value is not None and value / threshold >= w["rising_min_progress"])
    rising = streak >= w["rising_updates"] and far_enough
    watching = next_level is not None and (near or past or rising)
    reasons = []
    if watching and past:
        reasons.append(f"past the Level {next_level} threshold ({threshold:g}), not yet at that level")
    if watching and near:
        reasons.append(f"{_below_text(distance)} the Level {next_level} threshold ({threshold:g})")
    if watching and rising:
        reasons.append(f"rising for {streak} updates toward Level {next_level}")
    return {
        "id": subject.id,
        "category": subject.category,
        "title": subject.title,
        "item_id": subject.item_id,
        "level": subject.level,
        "next_level": next_level,
        "metric": subject.metric,
        "value": value,
        "next_threshold": threshold,
        "distance_to_threshold": round(distance, 4) if distance is not None else None,
        "trend": trend,
        "rising_updates": streak,
        "watching": watching,
        "watch_reason": "; ".join(reasons) or None,
        "source_updated_at": at.isoformat() if at else (stored or {}).get("source_updated_at"),
        "last_run_id": run_id,
        "updated_at": now.isoformat(),
    }


# desk_watch columns copied into desk_watch_snapshots (the trend stays out:
# the earlier runs' copies hold it)
SNAPSHOT_COLUMNS = ("category", "title", "item_id", "level", "next_level", "metric", "value", "next_threshold",
                    "distance_to_threshold", "rising_updates", "watching", "watch_reason", "source_updated_at")


def watch_snapshots(rows, run_id: int | None, now: datetime, keep_from: datetime) -> list[dict]:
    """The watching list as of this run, for desk_watch_snapshots: every
    subject desk_watch holds after it (rows updated before keep_from are the
    ones the cleanup deletes), watching or not."""
    out = []
    for r in sorted(rows, key=lambda r: r["id"]):
        updated = desk._dt(r.get("updated_at"))
        if updated is not None and updated < keep_from:
            continue
        out.append({"run_id": run_id, "subject_id": r["id"], **{c: r.get(c) for c in SNAPSHOT_COLUMNS},
                    "rising_updates": r.get("rising_updates") or 0, "watching": bool(r.get("watching")),
                    "taken_at": now.isoformat()})
    return out


# --- category status ---------------------------------------------------------------------------

def _day_text(iso_day: str | None) -> str:
    if not iso_day:
        return ""
    d = datetime.fromisoformat(iso_day)
    return f" on {d.day} {d:%b}"


def all_clear(category: str, cfg: dict, stage: dict | None) -> str:
    """One line for a category with nothing open."""
    if category == "earthquake":
        q = cfg["quake"]
        return (f"No quakes within {q['india_buffer_km']:g} km of India, or M{q['anywhere_min_magnitude']:g}+ "
                f"in the region, in the last {q['lifecycle']['close_after_hours']:g} h")
    if category in ("flood", "cyclone"):
        return f"No current GDACS {category} alerts for India"
    if category == "fire":
        return (f"No state at {cfg['fire']['level_2_min_ratio']:g}× its seasonal fire norm"
                + _day_text((stage or {}).get("day")))
    # Named after the source that assessed it this run, as the item's reason is
    # (air.py); no new assessment (last-known) names neither.
    basis = AIR_BASIS.get((stage or {}).get("source"))
    return "No city Poor or worse" + (f" ({basis})" if basis else "")


# air stage summary "source" -> how the all-clear line names its basis
AIR_BASIS = {"data.gov.in": "CPCB AQI, real-time, unvalidated", "OpenAQ": "approx. CPCB band"}


def _source_note(category: str, results: dict, stage: dict | None) -> str | None:
    """Why this run gave no new levels for the category, or None if it did."""
    key, _, stage_name = CATEGORY_SOURCES[category]
    if stage is None:
        return f"{category} assessment failed this run"
    if stage_name == "desk":
        if stage["sources_good"][category]:
            return None
        return f"{key} fetch failed this run"
    return None if stage["source_good"] else stage["note"]


def _strength(item: dict) -> float:
    """Tie-break between open items at the same level: how far past its rule
    the item is (fire: ratio to norm, quakes: magnitude), never a raw count."""
    figures = item.get("figures") or {}
    return figures.get("ratio_to_norm") or figures.get("magnitude") or 0


def category_status(category: str, open_items: list[dict], *, results: dict, stage: dict | None, cfg: dict,
                    watching: int, run_id: int | None, now: datetime) -> dict:
    key, source_id, _ = CATEGORY_SOURCES[category]
    note = _source_note(category, results, stage)
    source_status = results[key].status if results.get(key) is not None else None
    if stage and stage.get("source_id"):  # air: whichever source set the level (data.gov.in or OpenAQ)
        source_id, source_status = stage["source_id"], stage.get("source_status")
    ranked = sorted(open_items, key=lambda i: (-i["severity_level"], -_strength(i), i["title"]))
    if ranked:
        summary = ranked[0]["title"] + (f" (+{len(ranked) - 1} more)" if len(ranked) > 1 else "")
    else:
        summary = all_clear(category, cfg, stage)
    if note:
        summary += f"{desk.LAST_KNOWN_SEP}{note}"
    return {
        "run_id": run_id,
        "category": category,
        "level": ranked[0]["severity_level"] if ranked else None,
        "open_items": len(ranked),
        "last_known": note is not None or any(i.get("last_known") for i in ranked),
        "summary": summary,
        "source": source_id,
        "source_status": source_status,
        "watching": watching,
        "taken_at": now.isoformat(),
    }


# --- stage --------------------------------------------------------------------------------------

def run_quiet(supabase, run_id: int | None, results: dict, now: datetime, stages: dict[str, dict | None], *,
              write: bool = True, cfg: dict | None = None) -> dict:
    """Update the watching list and write this run's category status.

    stages: each severity stage's summary by name ("desk", "fire_desk",
    "air"), or None when the stage failed. A category whose stage failed or
    whose source gave no new data keeps its watch rows as they were.
    """
    cfg = cfg or severity_config.load()
    try:
        stored = {r["id"]: r for r in supabase.table(WATCH_TABLE).select("*").execute().data}
        open_rows = supabase.table(desk.ITEMS_TABLE).select("*").eq("status", "open").execute().data
    except Exception as exc:
        if write:
            raise
        logger.warning("dry-run: could not read desk_watch / desk_items (is migration 005 applied?) — %s", exc)
        stored, open_rows = {}, []

    subjects = [s for stage in stages.values() if stage for s in stage.get("watch", [])]
    good = {c for c in CATEGORIES if _source_note(c, results, stages.get(CATEGORY_SOURCES[c][2])) is None}
    rows = [update_row(s, stored.get(s.id), cfg, now, run_id) for s in subjects]
    seen = {s.id for s in subjects}
    for old in stored.values():  # e.g. a quake item that closed this run
        if old["id"] not in seen and old["category"] in good and old.get("watching"):
            rows.append({**old, "watching": False, "watch_reason": None, "last_run_id": run_id})

    current = {**stored, **{r["id"]: r for r in rows}}
    items = {r["id"]: r for r in open_rows}
    items.update({r["id"]: r for stage in stages.values() if stage for r in stage.get("items", [])})
    statuses = []
    for category in CATEGORIES:
        open_items = [i for i in items.values() if i["category"] == category and i["status"] == "open"]
        watching = sum(1 for r in current.values() if r["category"] == category and r.get("watching"))
        statuses.append(category_status(
            category, open_items, results=results, stage=stages.get(CATEGORY_SOURCES[category][2]), cfg=cfg,
            watching=watching, run_id=run_id, now=now))

    cutoff = now - timedelta(days=cfg["watching"]["keep_days"])
    snapshots = watch_snapshots(current.values(), run_id, now, cutoff)
    if write:
        for start in range(0, len(rows), BATCH_SIZE):
            supabase.table(WATCH_TABLE).upsert(rows[start:start + BATCH_SIZE], on_conflict="id").execute()
        supabase.table(STATUS_TABLE).upsert(statuses, on_conflict="run_id,category").execute()
        for start in range(0, len(snapshots), BATCH_SIZE):
            supabase.table(WATCH_SNAPSHOTS_TABLE).upsert(
                snapshots[start:start + BATCH_SIZE], on_conflict="run_id,subject_id").execute()
        supabase.table(WATCH_TABLE).delete().lt("updated_at", cutoff.isoformat()).execute()

    watching_rows = sorted((r for r in current.values() if r.get("watching")), key=lambda r: (r["category"], r["id"]))
    return {
        "watching": [f"{r['title']} ({r['category']}): {r['watch_reason']}" for r in watching_rows],
        "status": {s["category"]: (f"L{s['level']}" if s["level"] else "none open")
                   + (f" ({s['open_items']} open)" if s["open_items"] > 1 else "")
                   + (" last-known" if s["last_known"] else "") for s in statuses},
        "statuses": statuses,
        "subjects": len(rows),
        "snapshots": len(snapshots),
    }
