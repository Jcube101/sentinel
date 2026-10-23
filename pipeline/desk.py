"""Severity desk: one item per thing worth a line, on one 1-4 scale.

Step 2 of docs/severity-pipeline.md covers earthquakes (USGS) and floods
and cyclones (GDACS). Each run:

  1. turn this run's source data into candidates (level, reason, figures)
  2. reconcile them with the stored items: open, escalate, de-escalate,
     close or reopen; when the source failed, keep the item as "last-known"
  3. upsert desk_items and write a snapshot of every open (or just-closed)
     item for this run

Thresholds come from severity.toml. Schema: migrations/002_desk_items.sql.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from dateutil import parser as dateutil_parser

import geo
import severity_config

logger = logging.getLogger(__name__)

ITEMS_TABLE = "desk_items"
SNAPSHOTS_TABLE = "desk_item_snapshots"
BATCH_SIZE = 500

EARTHQUAKE, FLOOD, CYCLONE = "earthquake", "flood", "cyclone"
GDACS_CATEGORIES = {"FL": FLOOD, "TC": CYCLONE}
GDACS_COLOUR_RANK = {"Green": 1, "Orange": 2, "Red": 3}

# Appended to an item's reason while it is kept as last-known, with why.
LAST_KNOWN_SEP = " · last known: "

ITEM_COLUMNS = (
    "id", "category", "source", "source_ref", "title", "place_name", "latitude", "longitude",
    "severity_level", "severity_reason", "peak_level", "status", "opened_at", "escalated_at",
    "closed_at", "last_known", "observed_at", "source_updated_at", "figures",
    "first_run_id", "last_run_id", "updated_at",
)


@dataclass
class Candidate:
    """What this run's source data says about one item."""
    id: str
    category: str
    source: str               # sources.id
    source_ref: str | None    # events.id it came from
    title: str
    place_name: str | None
    latitude: float | None
    longitude: float | None
    level: int
    reason: str
    observed_at: datetime | None
    source_updated_at: datetime | None
    figures: dict


@dataclass
class WatchSubject:
    """One thing measured against its next level, for the watching list (watch.py).

    level:      current level (None = nothing at Level 1, e.g. no Poor city)
    next_level: the level it is measured against (None = none reachable)
    value / threshold: next_level starts when value reaches threshold;
                threshold None when there is no distance to compute (GDACS)
    """
    id: str
    category: str
    title: str
    item_id: str | None
    level: int | None
    next_level: int | None
    metric: str | None
    value: float | None
    threshold: float | None
    source_updated_at: datetime | None


def _dt(value) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = dateutil_parser.parse(str(value))
    except (ValueError, OverflowError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _iso(value) -> str | None:
    dt = _dt(value)
    return dt.isoformat() if dt else None


# --- earthquakes (USGS) -------------------------------------------------------

def quake_level(magnitude: float, cfg: dict) -> int:
    q = cfg["quake"]
    if magnitude >= q["level_4_min_magnitude"]:
        return 4
    if magnitude >= q["level_3_min_magnitude"]:
        return 3
    if magnitude >= q["level_2_min_magnitude"]:
        return 2
    return 1


def quake_candidates(rows: list[dict], cfg: dict, now: datetime, km_from_india=None) -> list[Candidate]:
    """In-scope quakes recent enough to be open: within india_buffer_km of
    India, or at least anywhere_min_magnitude anywhere in the USGS box."""
    km_from_india = km_from_india or geo.km_from_india
    q = cfg["quake"]
    window_start = now - timedelta(hours=q["lifecycle"]["close_after_hours"])
    out = []
    for row in rows:
        raw = row.get("raw") or {}
        magnitude = raw.get("mag", row.get("severity_value"))
        observed = _dt(row.get("started_at"))
        lat, lon = row.get("latitude"), row.get("longitude")
        if magnitude is None or observed is None or lat is None or lon is None:
            continue
        if observed < window_start:
            continue
        magnitude = round(float(magnitude), 1)  # level and title agree at e.g. 5.96
        km = km_from_india(float(lat), float(lon))
        if km > q["india_buffer_km"] and magnitude < q["anywhere_min_magnitude"]:
            continue

        where = "in India" if km == 0 else f"{max(1, round(km))} km from India"
        place = raw.get("place") or row.get("place_name")
        coords = (row.get("geometry") or {}).get("coordinates") or []
        updated_ms = raw.get("updated")
        out.append(Candidate(
            id=f"{EARTHQUAKE}:{row['id']}",
            category=EARTHQUAKE,
            source="USGS",
            source_ref=row["id"],
            title=f"M{magnitude:.1f} earthquake" + (f", {place}" if place else ""),
            place_name=place,
            latitude=float(lat),
            longitude=float(lon),
            level=quake_level(magnitude, cfg),
            reason=f"M{magnitude:.1f}, {where} (USGS)",
            observed_at=observed,
            source_updated_at=(
                datetime.fromtimestamp(updated_ms / 1000, tz=timezone.utc) if updated_ms else observed
            ),
            figures={
                "magnitude": magnitude,
                "magnitude_type": raw.get("magType"),
                "depth_km": coords[2] if len(coords) > 2 else None,
                "km_from_india": round(km, 1),
                "in_india": km == 0,
                "usgs_alert": raw.get("alert"),
                "tsunami": bool(raw.get("tsunami")),
                "felt_reports": raw.get("felt"),
            },
        ))
    return out


# --- floods and cyclones (GDACS) -------------------------------------------------

def gdacs_level(alert_level: str | None, rising: bool, cfg: dict) -> int:
    g = cfg["gdacs"]
    colour = (alert_level or "").strip().lower()
    if colour == "red":
        return g["red"]
    if colour == "orange":
        return g["orange"]
    return g["green_rising"] if rising else g["green"]


def gdacs_item_id(alert: dict) -> str | None:
    category = GDACS_CATEGORIES.get(alert["eventtype"])
    return f"{category}:{alert['id']}" if category else None


def gdacs_candidates(alerts: list[dict], existing: dict[str, dict], cfg: dict) -> list[Candidate]:
    """Current India flood and cyclone alerts.

    "Rising" = the episode alert score went up when GDACS published a new
    episode, compared with the episode before it (kept in the item's figures).
    The level follows the current episode, so an item can de-escalate; when
    the event as a whole peaked higher, the reason says so.
    """
    out = []
    for alert in alerts:
        item_id = gdacs_item_id(alert)
        if item_id is None or not alert["iscurrent"]:
            continue
        previous = (existing.get(item_id) or {}).get("figures") or {}
        score = alert["episodealertscore"]
        if previous.get("episode_id") == alert["episodeid"]:
            prev_score = previous.get("prev_episode_alert_score")
        else:
            prev_score = previous.get("episode_alert_score")
        rising = score is not None and prev_score is not None and score > prev_score

        colour = (alert["episodealertlevel"] or "Green").strip().capitalize()
        peak = (alert["alertlevel"] or "").strip().capitalize()
        reason = f"GDACS {colour} alert"
        if GDACS_COLOUR_RANK.get(peak, 0) > GDACS_COLOUR_RANK.get(colour, 0):
            reason += f" (event peaked {peak})"
        if rising:
            reason += f", rising (alert score {prev_score:g} → {score:g})"
        out.append(Candidate(
            id=item_id,
            category=GDACS_CATEGORIES[alert["eventtype"]],
            source="GDACS",
            source_ref=alert["id"],
            title=alert["name"],
            place_name=", ".join(alert["country_names"]) or None,
            latitude=alert["latitude"],
            longitude=alert["longitude"],
            level=gdacs_level(alert["episodealertlevel"], rising, cfg),
            reason=reason,
            observed_at=_dt(alert["fromdate"]),
            source_updated_at=_dt(alert["datemodified"]),
            figures={
                "alert_level": alert["alertlevel"],
                "alert_score": alert["alertscore"],
                "episode_id": alert["episodeid"],
                "episode_alert_level": alert["episodealertlevel"],
                "episode_alert_score": score,
                "prev_episode_alert_score": prev_score,
                "rising": rising,
                "severity": alert["severity"],
                "severity_text": alert["severity_text"],
                "severity_unit": alert["severity_unit"],
                "countries": alert["countries"],
                "gdacs_url": alert["url"],
                "ends_at": alert["todate"],
            },
        ))
    return out


# --- watching (step 7) -------------------------------------------------------------

def quake_watch(items: list[dict], cfg: dict) -> list[WatchSubject]:
    """Open quake items against the next magnitude band."""
    out = []
    for item in items:
        if item["category"] != EARTHQUAKE or item["status"] != "open":
            continue
        level = item["severity_level"]
        next_level = level + 1 if level < 4 else None
        out.append(WatchSubject(
            id=item["id"], category=EARTHQUAKE, title=item["title"], item_id=item["id"], level=level,
            next_level=next_level, metric="magnitude", value=(item.get("figures") or {}).get("magnitude"),
            threshold=cfg["quake"][f"level_{next_level}_min_magnitude"] if next_level else None,
            source_updated_at=_dt(item.get("source_updated_at"))))
    return out


def gdacs_watch(items: list[dict]) -> list[WatchSubject]:
    """Open flood and cyclone items. GDACS episode scores are fixed per colour
    (Green flood 0.5, Green cyclone 1.0), so there is no distance to the next
    colour; only a score rising over several episodes can put one on watch."""
    out = []
    for item in items:
        if item["category"] not in (FLOOD, CYCLONE) or item["status"] != "open":
            continue
        level = item["severity_level"]
        out.append(WatchSubject(
            id=item["id"], category=item["category"], title=item["title"], item_id=item["id"], level=level,
            next_level=level + 1 if level < 4 else None, metric="GDACS episode alert score",
            value=(item.get("figures") or {}).get("episode_alert_score"), threshold=None,
            source_updated_at=_dt(item.get("source_updated_at"))))
    return out


# --- reconcile -----------------------------------------------------------------

def _row(base: dict) -> dict:
    return {k: base.get(k) for k in ITEM_COLUMNS}


def _snapshot(row: dict, run_id: int, now: datetime, change: str | None, new_data: bool) -> dict:
    return {
        "run_id": run_id,
        "item_id": row["id"],
        "taken_at": now.isoformat(),
        "category": row["category"],
        "status": row["status"],
        "severity_level": row["severity_level"],
        "severity_reason": row["severity_reason"],
        "last_known": row["last_known"],
        "new_data": new_data,
        "change": change,
        "figures": row["figures"],
    }


def reconcile(existing: dict[str, dict], candidates: list[Candidate], *, categories: set[str],
              source_good: bool, open_min_level: int, expired, now: datetime,
              run_id: int, last_known_note: str | None = None,
              closes=None) -> tuple[list[dict], list[dict]]:
    """Apply the open / escalate / close rules for one source's categories.

    existing:    stored items by id (open ones, plus any candidate ids)
    expired:     item -> True when it closes on age alone, even if the
                 source failed (a quake 48 h on)
    source_good: this run's fetch for the source succeeded; when it didn't,
                 open items without a candidate stay open as last-known
    last_known_note: why, appended to a last-known item's reason
                 ("... · last known: OpenAQ fetch failed this run")
    closes:      (candidate, stored item) -> True to close an open item that
                 still has a candidate (fire: quiet for long enough). By
                 default an open item closes only when its candidate is gone.

    Returns (desk_items rows to upsert, snapshot rows).
    """
    now_iso = now.isoformat()
    items, snapshots = [], []
    seen = set()

    for c in candidates:
        seen.add(c.id)
        old = existing.get(c.id)
        # An update takes the candidate's source, the one that set this run's
        # level (air: DATAGOV, or OPENAQ when it falls back). A last-known item
        # (no candidate, below) keeps the source of its last level.
        fresh = {
            "source": c.source, "title": c.title, "place_name": c.place_name,
            "latitude": c.latitude, "longitude": c.longitude,
            "severity_level": c.level, "severity_reason": c.reason,
            "last_known": False, "observed_at": _iso(c.observed_at),
            "source_updated_at": _iso(c.source_updated_at), "figures": c.figures,
            "last_run_id": run_id, "updated_at": now_iso,
        }
        if old is None:
            if c.level < open_min_level:
                continue
            row = _row({
                "id": c.id, "category": c.category, "source": c.source, "source_ref": c.source_ref,
                **fresh, "peak_level": c.level, "status": "open", "opened_at": now_iso,
                "escalated_at": None, "closed_at": None, "first_run_id": run_id,
            })
            change = "opened"
        else:
            if old["status"] == "closed" and c.level < open_min_level:
                continue
            row = _row({**old, **fresh, "peak_level": max(old.get("peak_level") or c.level, c.level)})
            old_level = old["severity_level"]
            if old["status"] == "closed":
                row.update(status="open", closed_at=None)
                change = "reopened"
            elif closes is not None and closes(c, old):
                row.update(status="closed", closed_at=now_iso)
                change = "closed"
            elif c.level > old_level:
                row["escalated_at"] = now_iso
                change = "escalated"
            elif c.level < old_level:
                change = "deescalated"
            else:
                change = None
        old_updated = _dt((old or {}).get("source_updated_at"))
        new_data = old is None or (c.source_updated_at is not None and (
            old_updated is None or c.source_updated_at > old_updated))
        items.append(row)
        snapshots.append(_snapshot(row, run_id, now, change, new_data))

    for item_id, old in existing.items():
        if item_id in seen or old["status"] != "open" or old["category"] not in categories:
            continue
        if source_good or expired(old):
            row = _row({**old, "status": "closed", "closed_at": now_iso, "last_known": False,
                        "last_run_id": run_id, "updated_at": now_iso})
            change = "closed"
        else:
            row = _row({**old, "last_known": True, "last_run_id": run_id, "updated_at": now_iso})
            if last_known_note:
                base = (old.get("severity_reason") or "").split(LAST_KNOWN_SEP)[0]
                row["severity_reason"] = f"{base}{LAST_KNOWN_SEP}{last_known_note}"
            change = None
        items.append(row)
        snapshots.append(_snapshot(row, run_id, now, change, new_data=False))
    return items, snapshots


# --- stage ---------------------------------------------------------------------

def load_items(supabase, categories: set[str], candidate_ids: list[str]) -> dict[str, dict]:
    """Open items in these categories, plus any stored item a candidate matches."""
    resp = (supabase.table(ITEMS_TABLE).select("*")
            .eq("status", "open").in_("category", sorted(categories)).execute())
    by_id = {r["id"]: r for r in resp.data}
    missing = [i for i in candidate_ids if i not in by_id]
    for start in range(0, len(missing), 100):
        resp = supabase.table(ITEMS_TABLE).select("*").in_("id", missing[start:start + 100]).execute()
        by_id.update({r["id"]: r for r in resp.data})
    return by_id


def store(supabase, items: list[dict], snapshots: list[dict]) -> None:
    """Upsert items, then their snapshots (which reference them)."""
    for start in range(0, len(items), BATCH_SIZE):
        supabase.table(ITEMS_TABLE).upsert(items[start:start + BATCH_SIZE], on_conflict="id").execute()
    for start in range(0, len(snapshots), BATCH_SIZE):
        supabase.table(SNAPSHOTS_TABLE).upsert(
            snapshots[start:start + BATCH_SIZE], on_conflict="run_id,item_id").execute()


def run_desk(supabase, run_id: int | None, results: dict, now: datetime, *,
             write: bool = True, cfg: dict | None = None, km_from_india=None) -> dict:
    """Build, reconcile and (if write) store desk items. Returns a summary.

    results: pipeline FetchResults by source name; needs USGS and GDACS.
    With write=False (dry run) nothing is written, and a missing table is
    read as "no stored items".
    """
    cfg = cfg or severity_config.load()
    usgs, gdacs = results["USGS"], results["GDACS"]
    usgs_good, gdacs_good = usgs.status == "ok", gdacs.status == "ok"
    alerts = gdacs.extras.get("alerts", []) if gdacs_good else []

    quakes = quake_candidates(usgs.rows, cfg, now, km_from_india) if usgs_good else []
    gdacs_ids = [i for a in alerts if a["iscurrent"] and (i := gdacs_item_id(a))]
    categories = {EARTHQUAKE, FLOOD, CYCLONE}
    try:
        existing = load_items(supabase, categories, [c.id for c in quakes] + gdacs_ids)
    except Exception as exc:
        if write:
            raise
        logger.warning("dry-run: could not read desk items (is migration 002 applied?) — %s", exc)
        existing = {}
    floods_cyclones = gdacs_candidates(alerts, existing, cfg)

    window = timedelta(hours=cfg["quake"]["lifecycle"]["close_after_hours"])

    def quake_expired(item):
        observed = _dt(item.get("observed_at"))
        return observed is not None and observed < now - window

    q_items, q_snaps = reconcile(
        existing, quakes, categories={EARTHQUAKE}, source_good=usgs_good,
        open_min_level=cfg["quake"]["lifecycle"]["open_min_level"],
        expired=quake_expired, now=now, run_id=run_id)
    g_items, g_snaps = reconcile(
        existing, floods_cyclones, categories={FLOOD, CYCLONE}, source_good=gdacs_good,
        open_min_level=cfg["gdacs"]["lifecycle"]["open_min_level"],
        expired=lambda item: False, now=now, run_id=run_id)
    items, snapshots = q_items + g_items, q_snaps + g_snaps

    if write:
        store(supabase, items, snapshots)

    open_items = [i for i in items if i["status"] == "open"]
    watch = (quake_watch(q_items, cfg) if usgs_good else []) + (gdacs_watch(g_items) if gdacs_good else [])
    return {
        "open": len(open_items),
        "max_level": max((i["severity_level"] for i in open_items), default=None),
        "last_known": sum(1 for i in open_items if i["last_known"]),
        "changes": {s["item_id"]: s["change"] for s in snapshots if s["change"]},
        "items": items,
        "watch": watch,
        "sources_good": {EARTHQUAKE: usgs_good, FLOOD: gdacs_good, CYCLONE: gdacs_good},
    }
