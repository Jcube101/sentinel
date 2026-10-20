"""Pull the FIRMS VIIRS NOAA-20 standard-processing (SP) archive for India.

One-off input for the fire baseline and the static heat-source mask
(step 5 of docs/severity-pipeline.md). From pipeline/:

    PYTHONPATH=. .venv/bin/python tools/pull_firms_archive.py \\
        --start 2024-01-01 --end 2025-12-31 \\
        --cache-dir /home/jcube/projects/sentinel-data/firms_sp

Five-day chunks (the API maximum), each saved as <first day>.csv.gz.
Chunks already on disk are skipped, so a rerun resumes where it stopped.
Pacing: before each request the key's transaction count is checked
(mapkey_status); when fewer than HEADROOM of the 5,000-per-10-minutes
transactions are left it waits, and it pauses PAUSE_S between requests.
A request costs ~9 transactions, so 2 years (~147 chunks) is ~1,300.
"""
import argparse
import gzip
import logging
import os
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

from config import FIRMS_MAP_KEY, INDIA_BBOX_FIRMS
from fetchers.firms import ENDPOINT_DATE
from fetchers.http import get_with_retry

logger = logging.getLogger("pull_firms_archive")

PRODUCT = "VIIRS_NOAA20_SP"
CHUNK_DAYS = 5
PAUSE_S = 2.0
HEADROOM = 1000          # transactions to leave unused in the 10-minute window
STATUS_URL = "https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/"


def chunks(start: date, end: date):
    day = start
    while day <= end:
        n = min(CHUNK_DAYS, (end - day).days + 1)
        yield day, n
        day += timedelta(days=n)


def wait_for_quota() -> int:
    """Block until the key has HEADROOM transactions to spare; return the count used."""
    while True:
        status = requests.get(STATUS_URL, params={"MAP_KEY": FIRMS_MAP_KEY}, timeout=30).json()
        used, limit = int(status["current_transactions"]), int(status["transaction_limit"])
        if used <= limit - HEADROOM:
            return used
        logger.info("FIRMS key at %d/%d transactions, waiting 60 s", used, limit)
        time.sleep(60)


def fetch_chunk(day: date, n: int) -> str:
    url = ENDPOINT_DATE.format(key=FIRMS_MAP_KEY, product=PRODUCT, bbox=INDIA_BBOX_FIRMS,
                               day_range=n, date=day.isoformat())
    for attempt in range(3):
        resp = get_with_retry("FIRMS", url, timeout=180)
        if resp.status_code < 500:
            break
        logger.warning("%s: HTTP %d, retrying in 30 s", day, resp.status_code)
        time.sleep(30)
    resp.raise_for_status()
    text = resp.text
    if not text.startswith("latitude,"):  # FIRMS reports errors as plain text with HTTP 200
        raise RuntimeError(f"{day}: unexpected response: {text[:120]!r}")
    return text


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--cache-dir", type=Path, required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    for name in ("httpx", "urllib3"):
        logging.getLogger(name).setLevel(logging.WARNING)

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    todo = [(d, n) for d, n in chunks(args.start, args.end) if not (args.cache_dir / f"{d}.csv.gz").exists()]
    total = len(list(chunks(args.start, args.end)))
    logger.info("%d chunks in range, %d already cached, %d to pull", total, total - len(todo), len(todo))

    t_start, rows_total, bytes_total = time.monotonic(), 0, 0
    for i, (day, n) in enumerate(todo, 1):
        used = wait_for_quota()
        t0 = time.monotonic()
        text = fetch_chunk(day, n)
        rows = text.count("\n") - 1
        out = args.cache_dir / f"{day}.csv.gz"
        tmp = out.with_suffix(".gz.part")
        with gzip.open(tmp, "wt", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, out)  # only complete chunks count as cached
        rows_total, bytes_total = rows_total + rows, bytes_total + len(text)
        logger.info("[%d/%d] %s +%dd: %d rows, %.2f MB, %.1f s (key at %d transactions)",
                    i, len(todo), day, n, rows, len(text) / 1e6, time.monotonic() - t0, used)
        time.sleep(PAUSE_S)

    logger.info("done: %d rows, %.0f MB raw, %.1f min", rows_total, bytes_total / 1e6,
                (time.monotonic() - t_start) / 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
