"""
One-time historical data loader for the Sentinel pipeline.

Usage:
    python backfill.py --source all --days 90
    python backfill.py --source firms --days 60
    python backfill.py --source eonet --days 365
    python backfill.py --source usgs  --days 365
    python backfill.py --source gdacs --days 180
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta, timezone

from supabase import Client, create_client

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from fetchers import eonet, firms, gdacs, usgs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

EVENTS_TABLE = "events"
BATCH_SIZE = 500
USGS_CHUNK_DAYS = 90  # avoid the 20 000-result limit on long ranges


def _chunks(lst: list, size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def _dedup(rows: list) -> list:
    """Deduplicate by id, keeping last occurrence. Guards against duplicate
    IDs within a single payload, which Postgres rejects on ON CONFLICT upserts."""
    seen: dict = {}
    for row in rows:
        seen[row["id"]] = row
    return list(seen.values())


def _upsert(supabase: Client, rows: list) -> int:
    if not rows:
        return 0
    rows = _dedup(rows)
    upserted = 0
    for batch in _chunks(rows, BATCH_SIZE):
        supabase.table(EVENTS_TABLE).upsert(batch, on_conflict="id").execute()
        upserted += len(batch)
    return upserted


# ---------------------------------------------------------------------------
# Per-source backfill functions
# ---------------------------------------------------------------------------

def _backfill_firms(start: datetime, end: datetime) -> list[dict]:
    # FIRMS API max day_range = 5 for both NRT and SP products.
    # SP (Standard Processing) has a ~2-month lag — chunks older than that
    # return 0 rows, which is expected. NRT covers only the last ~10 days.
    # Chunks falling in the gap between SP cutoff and NRT window return 0 rows.
    return firms.fetch_range(start, end, chunk_days=5)


def _backfill_eonet(start: datetime, end: datetime) -> list[dict]:
    return eonet.fetch(
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
    )


def _backfill_gdacs(start: datetime, end: datetime) -> list[dict]:
    return gdacs.fetch(
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
    )


def _backfill_usgs(start: datetime, end: datetime) -> list[dict]:
    """Chunk into 90-day windows to avoid the USGS 20 000-row result cap."""
    all_events: list[dict] = []
    chunk_start = start
    chunk_num = 0
    total_days = (end - start).days
    num_chunks = max(1, (total_days + USGS_CHUNK_DAYS - 1) // USGS_CHUNK_DAYS)

    while chunk_start < end:
        chunk_num += 1
        chunk_end = min(chunk_start + timedelta(days=USGS_CHUNK_DAYS), end)
        logger.info(
            "USGS: fetching chunk %d/%d (%s to %s)",
            chunk_num, num_chunks,
            chunk_start.strftime("%Y-%m-%d"),
            chunk_end.strftime("%Y-%m-%d"),
        )
        rows = usgs.fetch(
            start_date=chunk_start.strftime("%Y-%m-%d"),
            end_date=chunk_end.strftime("%Y-%m-%d"),
        )
        logger.info("USGS: chunk %d returned %d events", chunk_num, len(rows))
        all_events.extend(rows)
        chunk_start = chunk_end

    return all_events


SOURCES = {
    "firms": _backfill_firms,
    "eonet": _backfill_eonet,
    "gdacs": _backfill_gdacs,
    "usgs":  _backfill_usgs,
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(source: str, days: int) -> int:
    start_time = time.monotonic()
    end_dt = datetime.now(tz=timezone.utc)
    start_dt = end_dt - timedelta(days=days)

    logger.info(
        "Backfill starting: source=%s days=%d (%s to %s)",
        source, days,
        start_dt.strftime("%Y-%m-%d"),
        end_dt.strftime("%Y-%m-%d"),
    )

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    sources_to_run = list(SOURCES.keys()) if source == "all" else [source]
    counts: dict[str, int] = {}
    any_failure = False

    for name in sources_to_run:
        try:
            rows = SOURCES[name](start_dt, end_dt)
            upserted = _upsert(supabase, rows)
            counts[name] = upserted
            logger.info("%s: upserted %d rows", name.upper(), upserted)
        except Exception as exc:
            logger.error("%s: backfill failed — %s", name.upper(), exc)
            counts[name] = 0
            any_failure = True

    total = sum(counts.values())
    duration = time.monotonic() - start_time

    print("")
    print("=== Sentinel Backfill Complete ===")
    print(f"  Source: {source}")
    print(f"  Days:   {days}")
    for name in sources_to_run:
        print(f"  {name.upper():<8} {counts.get(name, 0)} events")
    print(f"  Total upserted: {total}")
    print(f"  Duration: {duration:.1f}s")
    print("==================================")

    return 1 if any_failure else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sentinel historical data backfill")
    parser.add_argument(
        "--source",
        choices=["all", "firms", "eonet", "gdacs", "usgs"],
        default="all",
        help="Data source to backfill (default: all)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=90,
        help="Number of days to go back from today (default: 90)",
    )
    args = parser.parse_args()
    sys.exit(run(args.source, args.days))
