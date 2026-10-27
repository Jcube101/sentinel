# Sentinel Pipeline

Python data pipeline for the Sentinel natural disaster tracker.
Fetches from 5 APIs and upserts to Supabase three times daily via a systemd timer on the Raspberry Pi (jobpi).

## Status
All 5 fetchers complete and validated. pipeline.py and backfill.py working end-to-end.
systemd timer deployed on the Raspberry Pi (jobpi), three times daily at 09:00, 15:00, 21:00 UTC.
- FIRMS → ~5,800 fire hotspot events (pipeline); ~97,245 events backfilled (30 days)
- EONET → ~93 events (wildfires + severe storms)
- GDACS → ~47 events (floods, cyclones, earthquakes)
- USGS → ~102 earthquake events
- OpenAQ → ~200 AQI readings

## How to Run

Full pipeline (from pipeline/ directory):
```bash
PYTHONPATH=. python pipeline.py
```

Individual fetchers:
```bash
PYTHONPATH=. python -m fetchers.firms
PYTHONPATH=. python -m fetchers.eonet
PYTHONPATH=. python -m fetchers.gdacs
PYTHONPATH=. python -m fetchers.usgs
PYTHONPATH=. python -m fetchers.openaq
```

Note: use `python -m fetchers.firms` (module syntax), not `python fetchers/firms.py`,
due to the relative import of `config`.

## Known Issues
- OpenAQ rate limiting: ~10-20% of location sensor requests return 429.
  Mitigated with `time.sleep(0.5)` between requests and limit=50 locations.
- aqi_readings upsert requires a unique constraint on (location_id, parameter, recorded_at).
  Run this SQL in Supabase once: `ALTER TABLE aqi_readings ADD CONSTRAINT aqi_readings_location_param_time_key UNIQUE (location_id, parameter, recorded_at);`
### Supabase Data API grants (from October 30, 2026)
New tables created in the `public` schema after October 30, 2026 require
explicit grants before supabase-js or the REST API can access them.
Existing tables (events, aqi_readings, sources, categories) are unaffected.

When adding a new table, include these grants in its migration:

  grant select on public.your_table to anon;
  grant select, insert, update, delete on public.your_table to service_role;

Without these, the API returns "permission denied" on the new table.
anon and authenticated are read-only: never grant them insert/update/delete.
Only the service role (the pipeline) writes. Also enable RLS with a select
policy, as in migrations/001.

## Tests

Offline tests (no network, no credentials), from pipeline/:
```bash
.venv/bin/pip install -r requirements-dev.txt   # once; pytest is dev-only
.venv/bin/python -m pytest
```

## Severity thresholds

All severity thresholds live in `severity.toml` (drafts, tune freely); never
hard-code them. `severity_config.load()` reads and checks it. Design and
build plan: `docs/severity-pipeline.md` at the repo root.

## Backfill

Run historical load (from pipeline/ directory):
```bash
PYTHONPATH=. python backfill.py --source all --days 90
PYTHONPATH=. python backfill.py --source firms --days 30
PYTHONPATH=. python backfill.py --source usgs --days 365
```

Note: FIRMS NRT product only covers the last ~10 days. The SP (Standard Processing)
product has a ~2-month processing lag, so chunks in the Mar-Apr 2026 window return 0
rows — this is expected, not a bug.

## Archive

Run archive.py to copy old Supabase data to local SQLite (sentinel_archive.db):
```bash
PYTHONPATH=. python archive.py
```

- Archives events older than 30 days
- Archives aqi_readings older than 7 days
- Uses INSERT OR REPLACE, safe to run multiple times
- Does NOT delete from Supabase (cleanup is handled by pipeline.py)

`pipeline.py` calls `archive.run()` directly, immediately before cleanup, on
every invocation, so this does not need separate scheduling. The command
above is for running it standalone. Windows Task Scheduler archival is
fully retired: `setup_task_scheduler.ps1` has been removed from the repo
and the Windows scheduled task has been disabled.

## Cleanup (auto, runs inside pipeline.py)

`_cleanup()` runs at the end of every `pipeline.run()`:
- FIRMS / GDACS events: keep 60 days
- EONET / USGS events: keep 365 days
- AQI readings: keep 7 days

## Stack
- Python 3.11
- supabase-py
- requests
- python-dotenv
- python-dateutil
- shapely (+ numpy): India outline / district geometry for the severity desk

## Environment Variables
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- FIRMS_MAP_KEY
- OPENAQ_API_KEY
- DATA_GOV_IN_API_KEY (data.gov.in key for CPCB's real-time AQI feed; without it
  the air item uses OpenAQ)
- NOTIFY_WEBHOOK_URL (optional; failure and staleness alerts, see notify.py)

## Data Sources
- FIRMS: fire hotspots (India bbox: 68.7,8.4,97.4,37.1)
- EONET: cyclones + wildfires (category filter + India bbox)
- GDACS: floods, cyclones, earthquakes (GeoJSON feed)
- USGS: earthquakes (India bbox, min magnitude 4.0)
- OpenAQ: AQI readings for Indian cities (PM2.5, PM10, NO2); the map's aqi_readings
- data.gov.in (CPCB real-time AQI, `datagov.py`): the air desk item's primary source,
  read by the air stage only (not a fetcher, writes no rows of its own)

## Supabase Tables
- events: all disaster events
- aqi_readings: air quality readings
- pipeline_runs: one row per non-dry run; id is the edition number (runs.py)
- sources: one row per source, plus freshness columns written every run
  (last_success_at = last good fetch, newest_observation_at, last_new_data_at)
- fire_events: FIRMS hotspots clustered per UTC day, with district/state (fire.py);
  views fire_district_daily, fire_state_daily
- fire_baseline: seasonal norm, mean daily fire events per state per week (baseline.py)
- desk_items: severity desk, one row per item with a 1-4 level (desk.py)
- desk_item_snapshots: one row per desk item per run; views desk_daily_max
  (most severe open item per IST day) and desk_last_level3
- desk_watch: watching list, distance to the next level and trend per subject (watch.py)
- category_status: one row per category per run; view category_status_latest

## Fire events
`fire.py` runs first of the severity stages: nominal/high-confidence FIRMS
hotspots, minus the static heat-source mask (data/static_heat_cells.json,
built in step 5), are clustered per UTC day (1.5 km single linkage) and
placed in a district (data/india_districts.geojson). Each run rebuilds
today and yesterday in fire_events and keeps 14 days.

## Fire baseline (one-off)
The static mask and the seasonal norm come from the FIRMS VIIRS NOAA-20 SP
archive, 2024-2025 (~147 five-day requests, ~1,300 FIRMS transactions,
paced on the key's transaction count; raw CSV kept outside the repo):
```bash
PYTHONPATH=. .venv/bin/python tools/pull_firms_archive.py --start 2024-01-01 \
    --end 2025-12-31 --cache-dir /home/jcube/projects/sentinel-data/firms_sp
PYTHONPATH=. .venv/bin/python tools/build_fire_baseline.py \
    --cache-dir /home/jcube/projects/sentinel-data/firms_sp --upload
```
Outputs data/static_heat_cells.json, data/fire_baseline.csv and the
fire_baseline table (migration 004). Rerun only to change years or parameters.

## Severity desk
`desk.py` runs after the events / aqi_readings writes: quakes (USGS, within
100 km of India or M6+ in the box), floods and cyclones (GDACS India alerts
from `gdacs.fetch_detailed()`) become desk items with a level, a reason and
open / escalate / close rules; a failed source leaves its items "last-known".
India's outline is `data/india_outline.geojson` (see data/README.md).
`air.py` adds one national air-quality item (`air:IN`). Primary source: CPCB's
real-time AQI on data.gov.in (`datagov.py`, 4 requests): CPCB's own sub-indices,
station AQI = highest sub-index (3+ pollutants incl. PM2.5 or PM10), city AQI =
mean of its stations; reason "CPCB AQI, real-time (unvalidated)", item source
DATAGOV. The API hangs requests with Python's default user agent, so datagov.py
sends its own. Fallback when the feed fails, its snapshot is older than
`air.datagov.max_snapshot_age_hours` or it has fewer than `air.min_fresh_cities`
cities: 24 h means at CPCB / AirNow monitors on OpenAQ (~36 listing requests plus
up to `air.max_history_requests` history requests, ~3 min), reason "approx. CPCB
band", item source OPENAQ. OpenAQ readings older than the data behind the item's
current level don't count (`air.level_data_from`), so the fallback never replaces a
level with older data. Either way a city counts as Severe only after
`air.severe_confirm_runs` assessments in a row. With neither source usable the
item stays last-known and the reason says why. Each feed attempt updates the
DATAGOV sources row (migration 006) and pipeline_runs.sources. Tests never reach
data.gov.in (tests/conftest.py drops the key and blocks requests).

## Fire desk
`fire_desk.py` runs right after the fire stage and turns its fire_events rows
into one item per state (`fire:<state slug>`, e.g. `fire:madhya-pradesh`).
The level comes from the last complete UTC day (yesterday; NOAA-20's night
pass over India ends ~21:00 UTC): its fire events over the state's norm for
that week (`data/fire_baseline.csv`), counted from `fire.min_fire_events`
events; a large fire near a city (`data/india_places.csv`) is Level 4. These
FIRMS-derived levels are capped at `fire.calibration_cap` (2) until live
counts are calibrated against the archive; a current GDACS wildfire alert in
the state lifts the item to Level 3 regardless. Today's events so far are in
`figures.today` (marked partial) and never set the level. Items close after
`fire.lifecycle.close_after_hours` of complete days below Level 2
(`figures.quiet_since`). If FIRMS fails, or has no rows for yesterday, open
items stay last-known; if GDACS fails, they keep their last known alerts.
To test threshold changes against the 2024-2025 archive before editing
severity.toml: `tools/replay_fire_levels.py --set fire.<key>=<value>` (usage in
docs/severity-pipeline.md, *Tuning fire thresholds*).

## Quiet-day desk
`watch.py` runs last. Each severity stage hands over watch subjects (a value
against the threshold of its next level: quake magnitude, GDACS episode score,
the air city the next level hinges on, each state's fire events) and its
items. It keeps their trend in `desk_watch` (a point per new source update,
not per run), marks them watching within `[watching] margin` of the threshold
or after `rising_updates` updates in a row toward it, and writes a
`category_status` row per category (level or none open, one-line summary,
source). Needs migration 005; a missing table fails the run.

## Migrations
Schema changes are numbered SQL files in `migrations/`. There is no DB URL or
psql on the Pi: Job pastes each file into the Supabase SQL editor. Write them
idempotent, with the Data API grants above, and merge code that needs a
migration only after it has been applied.

## Schema — events table
id: text (primary key, deterministic)
external_id: text
source: text (FIRMS | EONET | GDACS | USGS)
category: text (fire | flood | cyclone | earthquake)
title: text
description: text
severity: text (low | medium | high | extreme)
severity_value: numeric
severity_unit: text
status: text (open | closed)
started_at: timestamptz
closed_at: timestamptz
latitude: numeric
longitude: numeric
place_name: text
geometry: jsonb
source_url: text
raw: jsonb
created_at: timestamptz
updated_at: timestamptz

## Schema — aqi_readings table
id: bigint (auto)
location_id: text
location_name: text
city: text
latitude: numeric
longitude: numeric
parameter: text (pm25 | pm10 | no2 | so2 | o3)
value: numeric
unit: text
recorded_at: timestamptz
created_at: timestamptz

## Key Rules
- Every fetcher returns List[dict] matching Supabase schema exactly
- IDs must be deterministic, built from source data, never random UUIDs
- Always upsert, never plain insert (conflict key: id column)
- A fetcher must never crash the whole pipeline, but it must not swallow
  top-level failures either: per-row/per-feature errors are caught and
  skipped inside the fetcher, but a request or response-parse failure
  propagates out of `fetch()` so `_run_fetcher()` can catch it and mark that
  source failed for the run, without halting the others
- Log clearly: source name, rows fetched, rows upserted, any errors
- Never hardcode credentials, always read from environment variables
- A run that fails, or where FIRMS/USGS/OpenAQ go stale, sends an alert via
  notify.py if NOTIFY_WEBHOOK_URL is set; EONET/GDACS are event-driven and
  are never alerted on row age, only on the fetch itself failing
