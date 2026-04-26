"""
Archive old Supabase data to a local SQLite database.

Usage:
    python archive.py

Reads events older than 30 days and aqi_readings older than 7 days from
Supabase, and writes them to sentinel_archive.db in the project root.
Safe to run multiple times — uses INSERT OR REPLACE.
"""

import json
import logging
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone

from supabase import Client, create_client

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sentinel_archive.db")
PAGE_SIZE = 1000

_CREATE_EVENTS = """
CREATE TABLE IF NOT EXISTS events (
    id             TEXT PRIMARY KEY,
    external_id    TEXT,
    source         TEXT,
    category       TEXT,
    title          TEXT,
    description    TEXT,
    severity       TEXT,
    severity_value REAL,
    severity_unit  TEXT,
    status         TEXT,
    started_at     TEXT,
    closed_at      TEXT,
    latitude       REAL,
    longitude      REAL,
    place_name     TEXT,
    geometry       TEXT,
    source_url     TEXT,
    raw            TEXT,
    created_at     TEXT,
    updated_at     TEXT
)
"""

_CREATE_AQI = """
CREATE TABLE IF NOT EXISTS aqi_readings (
    id            INTEGER PRIMARY KEY,
    location_id   TEXT,
    location_name TEXT,
    city          TEXT,
    latitude      REAL,
    longitude     REAL,
    parameter     TEXT,
    value         REAL,
    unit          TEXT,
    recorded_at   TEXT,
    created_at    TEXT
)
"""

_EVENTS_JSON_COLS = {"geometry", "raw"}


def _fetch_all(supabase: Client, table: str, filter_col: str, cutoff: str) -> list[dict]:
    rows = []
    offset = 0
    while True:
        resp = (
            supabase.table(table)
            .select("*")
            .lt(filter_col, cutoff)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        batch = resp.data
        rows.extend(batch)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def _serialize_row(row: dict, json_cols: set) -> dict:
    result = {}
    for k, v in row.items():
        result[k] = json.dumps(v) if k in json_cols and v is not None else v
    return result


def _upsert_sqlite(conn: sqlite3.Connection, table: str, rows: list[dict], json_cols: set) -> int:
    if not rows:
        return 0
    serialized = [_serialize_row(r, json_cols) for r in rows]
    cols = list(serialized[0].keys())
    placeholders = ", ".join("?" * len(cols))
    sql = f"INSERT OR REPLACE INTO {table} ({', '.join(cols)}) VALUES ({placeholders})"
    conn.executemany(sql, [[r[c] for c in cols] for r in serialized])
    conn.commit()
    return len(rows)


def run() -> int:
    now = datetime.now(tz=timezone.utc)
    events_cutoff = (now - timedelta(days=30)).isoformat()
    aqi_cutoff = (now - timedelta(days=7)).isoformat()

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    logger.info("Fetching events older than 30 days (cutoff: %s)", events_cutoff[:10])
    events = _fetch_all(supabase, "events", "started_at", events_cutoff)
    logger.info("Fetched %d events", len(events))

    logger.info("Fetching aqi_readings older than 7 days (cutoff: %s)", aqi_cutoff[:10])
    aqi = _fetch_all(supabase, "aqi_readings", "recorded_at", aqi_cutoff)
    logger.info("Fetched %d aqi_readings", len(aqi))

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(_CREATE_EVENTS)
        conn.execute(_CREATE_AQI)
        conn.commit()

        events_archived = _upsert_sqlite(conn, "events", events, _EVENTS_JSON_COLS)
        aqi_archived = _upsert_sqlite(conn, "aqi_readings", aqi, set())
    finally:
        conn.close()

    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)

    print("")
    print("=== Sentinel Archive Run ===")
    print(f"  Events archived:       {events_archived}")
    print(f"  AQI readings archived: {aqi_archived}")
    print(f"  SQLite DB size:        {db_size_mb:.2f} MB")
    print("============================")

    return 0


if __name__ == "__main__":
    sys.exit(run())
