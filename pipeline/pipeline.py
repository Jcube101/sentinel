import argparse
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler

from dateutil import parser as dateutil_parser
from supabase import Client, create_client

import archive
from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from fetchers import eonet, firms, gdacs, openaq, usgs

# journald on this host evicts entries after a few hours (unrelated services
# flood it), so a once- or thrice-daily job's logs are gone before anyone can
# read them. A rotating file next to the pipeline is the durable log.
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "pipeline.log")

_formatter = logging.Formatter(
    fmt="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
_file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=7)
_file_handler.setFormatter(_formatter)
_stream_handler = logging.StreamHandler()
_stream_handler.setFormatter(_formatter)

# force=True: wins over any basicConfig a module we import (e.g. archive.py)
# already ran at import time, regardless of import order.
logging.basicConfig(level=logging.INFO, handlers=[_stream_handler, _file_handler], force=True)
logger = logging.getLogger(__name__)

EVENTS_TABLE = "events"
AQI_TABLE = "aqi_readings"
BATCH_SIZE = 500

# "Sane" freshness thresholds per source, derived from each API's documented
# update cadence (see SPEC.md) — not "always fresh", since EONET/GDACS are
# event-driven and can legitimately go quiet for weeks.
STALENESS_THRESHOLDS = {
    "FIRMS": timedelta(days=2),
    "USGS": timedelta(days=30),
    "EONET": timedelta(days=60),
    "GDACS": timedelta(days=60),
}
AQI_STALENESS_THRESHOLD = timedelta(hours=48)


def _chunks(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _dedup(rows: list) -> list:
    seen: dict = {}
    for row in rows:
        seen[row["id"]] = row
    return list(seen.values())


def _run_fetcher(name: str, module) -> tuple[list, bool]:
    """Call module.fetch(), return (results, success)."""
    try:
        results = module.fetch()
        logger.info("%s: fetched %d rows", name, len(results))
        return results, True
    except Exception as exc:
        logger.error("%s: fetcher raised an exception — %s", name, exc)
        return [], False


def _upsert(supabase, table: str, rows: list, conflict_key: str) -> int:
    if not rows:
        return 0
    upserted = 0
    for batch in _chunks(rows, BATCH_SIZE):
        resp = supabase.table(table).upsert(batch, on_conflict=conflict_key).execute()
        upserted += len(resp.data)
    return upserted


def _cleanup(supabase) -> None:
    now = datetime.now(tz=timezone.utc)
    cutoff_60 = (now - timedelta(days=60)).isoformat()
    cutoff_365 = (now - timedelta(days=365)).isoformat()
    cutoff_7 = (now - timedelta(days=7)).isoformat()

    try:
        resp = supabase.table(EVENTS_TABLE).delete().in_("source", ["FIRMS", "GDACS"]).lt("started_at", cutoff_60).execute()
        logger.info("cleanup: deleted %d high-volume events (FIRMS/GDACS >60 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: events (FIRMS/GDACS) delete failed — %s", exc)

    try:
        resp = supabase.table(EVENTS_TABLE).delete().in_("source", ["EONET", "USGS"]).lt("started_at", cutoff_365).execute()
        logger.info("cleanup: deleted %d low-volume events (EONET/USGS >365 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: events (EONET/USGS) delete failed — %s", exc)

    try:
        resp = supabase.table(AQI_TABLE).delete().lt("recorded_at", cutoff_7).execute()
        logger.info("cleanup: deleted %d aqi_readings (>7 days)", len(resp.data))
    except Exception as exc:
        logger.error("cleanup: aqi_readings delete failed — %s", exc)


def _newest_age(supabase, table: str, date_col: str, **eq_filters) -> timedelta | None:
    query = supabase.table(table).select(date_col)
    for col, val in eq_filters.items():
        query = query.eq(col, val)
    resp = query.order(date_col, desc=True).limit(1).execute()
    if not resp.data:
        return None
    newest = dateutil_parser.parse(resp.data[0][date_col])
    return datetime.now(tz=timezone.utc) - newest


def _check_staleness(supabase) -> None:
    """Log the newest-row age per source; warn if a source has gone stale.

    This is the tripwire that would have caught FIRMS silently ingesting
    nothing for 35 days — every prior run reported "success" with no signal
    that the data itself had stopped moving.
    """
    for source, threshold in STALENESS_THRESHOLDS.items():
        try:
            age = _newest_age(supabase, EVENTS_TABLE, "started_at", source=source)
        except Exception as exc:
            logger.error("staleness: check failed for %s — %s", source, exc)
            continue
        if age is None:
            logger.warning("staleness: %s has no rows in events table", source)
        elif age > threshold:
            logger.warning(
                "staleness: %s newest row is %s old (threshold %s)", source, age, threshold
            )
        else:
            logger.info("staleness: %s newest row is %s old (ok)", source, age)

    try:
        age = _newest_age(supabase, AQI_TABLE, "recorded_at")
    except Exception as exc:
        logger.error("staleness: check failed for aqi_readings — %s", exc)
        return
    if age is None:
        logger.warning("staleness: aqi_readings has no rows")
    elif age > AQI_STALENESS_THRESHOLD:
        logger.warning(
            "staleness: aqi_readings newest row is %s old (threshold %s)",
            age, AQI_STALENESS_THRESHOLD,
        )
    else:
        logger.info("staleness: aqi_readings newest row is %s old (ok)", age)


def run(dry_run: bool = False):
    start = time.monotonic()
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    # --- Run fetchers ---
    firms_rows,  firms_ok  = _run_fetcher("FIRMS",  firms)
    eonet_rows,  eonet_ok  = _run_fetcher("EONET",  eonet)
    gdacs_rows,  gdacs_ok  = _run_fetcher("GDACS",  gdacs)
    usgs_rows,   usgs_ok   = _run_fetcher("USGS",   usgs)
    openaq_rows, openaq_ok = _run_fetcher("OpenAQ", openaq)

    any_failure = not all([firms_ok, eonet_ok, gdacs_ok, usgs_ok, openaq_ok])

    # --- Write events ---
    all_events = _dedup(firms_rows + eonet_rows + gdacs_rows + usgs_rows)
    if dry_run:
        logger.info("dry-run: skipping events upsert (%d rows would be written)", len(all_events))
        events_upserted = 0
    else:
        try:
            events_upserted = _upsert(supabase, EVENTS_TABLE, all_events, "id")
            logger.info("events: upserted %d rows", events_upserted)
        except Exception as exc:
            logger.error("events: upsert failed — %s", exc)
            events_upserted = 0
            any_failure = True

    # --- Write AQI readings ---
    if dry_run:
        logger.info("dry-run: skipping aqi_readings upsert (%d rows would be written)", len(openaq_rows))
        aqi_upserted = 0
    else:
        try:
            aqi_upserted = _upsert(supabase, AQI_TABLE, openaq_rows, "location_id,parameter,recorded_at")
            logger.info("aqi_readings: upserted %d rows", aqi_upserted)
        except Exception as exc:
            logger.error("aqi_readings: upsert failed — %s", exc)
            aqi_upserted = 0
            any_failure = True

    duration = time.monotonic() - start

    print("")
    print("=== Sentinel Pipeline Run ===" + (" (DRY RUN)" if dry_run else ""))
    print(f"  FIRMS:   {len(firms_rows)} events")
    print(f"  EONET:   {len(eonet_rows)} events")
    print(f"  GDACS:   {len(gdacs_rows)} events")
    print(f"  USGS:    {len(usgs_rows)} earthquakes")
    print(f"  OpenAQ:  {len(openaq_rows)} readings")
    print(f"  Total events upserted:       {events_upserted}")
    print(f"  Total AQI readings upserted: {aqi_upserted}")
    print(f"  Duration: {duration:.1f}s")
    print("============================")

    # --- Archive before cleanup, so cleanup can never delete un-archived data ---
    # archive.run() only reads from Supabase and writes locally (INSERT OR
    # REPLACE — idempotent), so it's safe to actually run under --dry-run too;
    # only the destructive _cleanup() step below is gated on dry_run.
    try:
        archive_exit = archive.run()
        archive_ok = archive_exit == 0
        if not archive_ok:
            logger.error("archive: run exited %d — skipping cleanup this run", archive_exit)
    except Exception as exc:
        logger.error("archive: run raised an exception — %s — skipping cleanup this run", exc)
        archive_ok = False

    if not archive_ok:
        any_failure = True

    if dry_run:
        logger.info("dry-run: skipping cleanup")
    elif not archive_ok:
        logger.warning("cleanup: skipped — archive did not complete successfully")
    else:
        _cleanup(supabase)

    _check_staleness(supabase)

    return 1 if any_failure else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sentinel disaster data pipeline")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Run fetchers and report counts only; skip Supabase writes and cleanup",
    )
    args = parser.parse_args()
    sys.exit(run(dry_run=args.dry_run))
