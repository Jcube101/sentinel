"""Run records (edition numbers) and per-source freshness.

Every non-dry run gets a pipeline_runs row; its id is the edition number.
Each source's row in `sources` gets the last attempt, last good fetch, last
error, the newest observation it has delivered, and when that last moved
forward. Trend rules ("rising for 3 updates") count those new-data updates,
not runs: FIRMS publishes about twice a day, so the 02:30 IST run usually
repeats the 20:30 IST data.

Schema: migrations/001_pipeline_runs_and_source_freshness.sql.
"""
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from dateutil import parser as dateutil_parser

import config

logger = logging.getLogger(__name__)

RUNS_TABLE = "pipeline_runs"
SOURCES_TABLE = "sources"

# Pipeline fetcher name -> sources.id
SOURCE_IDS = {
    "FIRMS": "FIRMS",
    "EONET": "EONET",
    "GDACS": "GDACS",
    "USGS": "USGS",
    "OpenAQ": "OPENAQ",
}

# Sources that always return rows when healthy, so an empty fetch is not a
# good fetch (the "OpenAQ empty pull" case). EONET and GDACS can be quiet.
DENSE_SOURCES = {"FIRMS", "USGS", "OpenAQ"}

ERROR_TEXT_LIMIT = 500
# FIRMS map keys are 32 hex chars and sit in the request URL, which
# requests puts in its error messages.
_HEX_KEY = re.compile(r"\b[0-9a-fA-F]{32}\b")
# Any key passed as a query parameter (data.gov.in: ?api-key=...).
_KEY_PARAM = re.compile(r"((?:api[-_]?key|MAP_KEY)=)[^&\s'\"]+", re.IGNORECASE)


@dataclass
class FetchResult:
    name: str
    rows: list
    ok: bool              # False fails the run (unchanged pipeline semantics)
    status: str           # ok | empty | timeout | error
    error: str | None
    duration_s: float
    extras: dict = field(default_factory=dict)  # fetch_detailed() side data, e.g. GDACS alerts


def classify(name: str, rows: list, error: Exception | None, timed_out: bool, soft_timeout: bool) -> tuple[bool, str]:
    """Return (ok, status) for one fetch."""
    if timed_out:
        return soft_timeout, "timeout"
    if error is not None:
        return False, "error"
    if not rows and name in DENSE_SOURCES:
        return True, "empty"  # not a run failure (the staleness check owns that)
    return True, "ok"


def redact(text: str | None) -> str | None:
    """Strip credentials from error text before it is stored in a public table."""
    if text is None:
        return None
    for secret in (config.FIRMS_MAP_KEY, config.OPENAQ_API_KEY, config.SUPABASE_SERVICE_KEY,
                   config.DATA_GOV_IN_API_KEY):
        if secret and len(secret) >= 8:
            text = text.replace(secret, "***")
    text = _HEX_KEY.sub("***", text)
    text = _KEY_PARAM.sub(r"\1***", text)
    return text[:ERROR_TEXT_LIMIT]


def _to_datetime(value) -> datetime | None:
    if not value:
        return None
    try:
        dt = dateutil_parser.parse(str(value))
    except (ValueError, OverflowError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def newest_observation(name: str, rows: list) -> datetime | None:
    """Newest observation time in a fetch: when the data was observed, not fetched."""
    newest = None
    for row in rows:
        value = row.get("recorded_at") or row.get("started_at")
        if name == "GDACS":
            # GDACS revises events in place (alert level, end date); its
            # datemodified is when GDACS last published something new.
            value = (row.get("raw") or {}).get("datemodified") or value
        dt = _to_datetime(value)
        if dt is not None and (newest is None or dt > newest):
            newest = dt
    return newest


def freshness_update(status: str, error: str | None, rows: int, newest: datetime | None,
                     previous: dict | None, run_id: int | None, now: datetime) -> tuple[dict, bool]:
    """One sources row's freshness columns for an attempt; also whether it
    brought data newer than any seen before (previous: the current row)."""
    now_iso = now.isoformat()
    prev_newest = _to_datetime((previous or {}).get("newest_observation_at"))
    new_data = status == "ok" and newest is not None and (prev_newest is None or newest > prev_newest)
    update = {
        "last_attempt_at": now_iso,
        "last_status": status,
        "last_error": redact(error),
        "last_row_count": rows,
        "last_run_id": run_id,
    }
    if status == "ok":
        update["last_success_at"] = now_iso
    if new_data:
        update["newest_observation_at"] = newest.isoformat()
        update["last_new_data_at"] = now_iso
    return update, new_data


def source_updates(
    results: dict[str, FetchResult],
    written: dict[str, bool],
    previous: dict[str, dict],
    run_id: int | None,
    now: datetime,
) -> tuple[dict[str, dict], dict[str, dict]]:
    """Work out the sources-table updates and the run record's per-source summary.

    results:  fetch results keyed by pipeline source name
    written:  whether that source's rows reached Supabase this run
    previous: current sources rows keyed by sources.id (needs newest_observation_at)

    Returns (updates keyed by sources.id, summary keyed by sources.id). No I/O.
    """
    updates, summary = {}, {}
    for name, result in results.items():
        sid = SOURCE_IDS[name]
        status, error = result.status, result.error
        if status == "ok" and not written.get(name, False):
            status, error = "error", f"fetched {len(result.rows)} rows but the Supabase write failed"
        good = status == "ok"

        newest = newest_observation(name, result.rows) if good else None
        update, new_data = freshness_update(status, error, len(result.rows), newest, previous.get(sid),
                                            run_id, now)
        updates[sid] = update

        summary[sid] = {
            "status": status,
            "rows": len(result.rows),
            "duration_s": round(result.duration_s, 1),
            "error": redact(error),
            "newest_observation_at": newest.isoformat() if newest else None,
            "new_data": new_data,
        }
        parts = (result.extras or {}).get("parts")
        if parts:  # GDACS: each query's own result (fetchers/gdacs.py)
            summary[sid]["parts"] = {name: {**p, "error": redact(p.get("error"))} if p.get("error") else dict(p)
                                     for name, p in parts.items()}
    return updates, summary


def start_run(supabase, started_at: datetime, severity_config: dict | None = None) -> int:
    """Open the run record. severity_config: severity.toml as this edition runs
    it (migration 008), or None when it failed to load."""
    row = {"started_at": started_at.isoformat(), "status": "running"}
    if severity_config is not None:
        row["severity_config"] = severity_config
    resp = supabase.table(RUNS_TABLE).insert(row).execute()
    return resp.data[0]["id"]


def read_previous(supabase) -> dict[str, dict]:
    resp = supabase.table(SOURCES_TABLE).select("id,newest_observation_at").execute()
    return {row["id"]: row for row in resp.data}


def record_sources(supabase, run_id, results, written, now: datetime) -> dict[str, dict]:
    """Update each source's freshness columns; return the run summary."""
    updates, summary = source_updates(results, written, read_previous(supabase), run_id, now)
    for sid, values in updates.items():
        resp = supabase.table(SOURCES_TABLE).update(values).eq("id", sid).execute()
        if not resp.data:
            logger.warning("runs: no sources row with id=%s, freshness not recorded", sid)
    return summary


def finish_run(supabase, run_id: int, *, status: str, finished_at: datetime, duration_s: float,
               events_upserted: int, aqi_upserted: int, sources: dict | None) -> None:
    values = {
        "status": status,
        "finished_at": finished_at.isoformat(),
        "duration_s": round(duration_s, 1),
        "events_upserted": events_upserted,
        "aqi_upserted": aqi_upserted,
    }
    if sources is not None:
        values["sources"] = sources
    supabase.table(RUNS_TABLE).update(values).eq("id", run_id).execute()
