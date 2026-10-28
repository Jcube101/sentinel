# Sentinel Pipeline

Python data pipeline for the Sentinel natural disaster tracker. Five fetchers (FIRMS,
EONET, GDACS, USGS, OpenAQ) write `events` and `aqi_readings`; the severity stages then
build the severity desk from the same fetch results, plus CPCB's real-time AQI from
data.gov.in for the air item. It runs on the Raspberry Pi (jobpi) from a systemd timer at
09:00, 15:00 and 21:00 UTC (14:30, 20:30 and 02:30 IST). Each run is an edition: a
`pipeline_runs` row whose id is the edition number.

## Status (28 Oct 2026)
Severity pipeline complete (build steps 0-7, 21 Oct) and migrations 001-006 applied. Spec,
decisions, what has been verified live and the open follow-ups: `docs/severity-pipeline.md`
(*Where things stand*). Edition 25 (28 Oct, 02:30 IST), for scale: ok in 662 s; FIRMS
2,477 hotspot rows, EONET 1, GDACS 9 events, USGS 124 quakes, OpenAQ 424 readings, and
3,780 records from the data.gov.in feed (read by the air stage, not stored). GDACS took
499 s of that run (*Data Sources*).

## Run order
`pipeline.run()`, in order. Stages 4-8 are each isolated: one that fails marks the run
failed (so it alerts) while the others still run.
1. `runs.start_run()`: the `pipeline_runs` row (edition); skipped by `--dry-run`
2. Fetchers: FIRMS, EONET, GDACS, USGS, OpenAQ (`FETCHERS`), then the FIRMS timeout rule
   (`_tolerate_first_timeouts`, see *Key Rules*)
3. Upserts to `events` and `aqi_readings`; `runs.record_sources()` writes freshness on `sources`
4. `fire.py`: fire events
5. `fire_desk.py`: fire desk items, one per state
6. `desk.py`: quake, flood and cyclone items
7. `air.py`: the national air item (data.gov.in, OpenAQ fallback)
8. `watch.py`: watching list and `category_status`
9. `archive.run()`, then `_cleanup()` only if the archive succeeded
10. `_check_staleness()`, then `runs.finish_run()` closes the edition as ok or failed

## How to Run

Full pipeline (from pipeline/ directory). A real run creates an edition and writes to
Supabase; `--dry-run` fetches and logs what would happen without writing (no
`pipeline_runs` row, no cleanup):
```bash
PYTHONPATH=. .venv/bin/python pipeline.py --dry-run
PYTHONPATH=. .venv/bin/python pipeline.py
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
- OpenAQ rate limiting: some sensor requests return 429 (3 in edition 25). Mitigated with
  `time.sleep(0.5)` between requests and a cap of `MAX_LOCATIONS` (120) stations, the most
  recently reporting first.
- GDACS is slow, and sometimes hangs for hours: see *Data Sources* and the GDACS follow-up
  in docs/severity-pipeline.md.
- aqi_readings upserts need a unique constraint on (location_id, parameter, recorded_at).
  It is in place (every run's upsert on that conflict key succeeds); for a fresh database:
  `ALTER TABLE aqi_readings ADD CONSTRAINT aqi_readings_location_param_time_key UNIQUE (location_id, parameter, recorded_at);`

### Supabase Data API grants (from October 30, 2026)
New tables created in the `public` schema after October 30, 2026 require
explicit grants before supabase-js or the REST API can access them.
Existing tables (events, aqi_readings, sources, categories) are unaffected.

The rule (Job): only the service role (the pipeline) writes; anon and
authenticated are read-only. Every migration that adds a table uses this
pattern (as in migrations 002-005):

  alter table public.your_table enable row level security;
  drop policy if exists "your_table readable by everyone" on public.your_table;
  create policy "your_table readable by everyone"
    on public.your_table for select to anon, authenticated using (true);
  revoke all on public.your_table from anon, authenticated;
  grant select on public.your_table to anon;
  grant select, insert, update, delete on public.your_table to service_role;

A view gets the same `revoke all`, then `grant select` to anon and to
service_role. Without the grants, the API returns "permission denied". The
older tables (events, aqi_readings, sources, categories) predate this pattern:
anon could still UPDATE them (RLS stopped it, the grant didn't). Migration 007
puts them on it, keeping anon's SELECT while the live site reads events and
aqi_readings; dropping that SELECT waits for the frontend switch.

## Tests

Offline tests (no network, no credentials), from pipeline/:
```bash
.venv/bin/pip install -r requirements-dev.txt   # once; pytest is dev-only
.venv/bin/python -m pytest
```
Supabase is a fake (`tests/fakes.py`) and the fetchers are stubbed, so tests never write
real rows or create `pipeline_runs` rows; `tests/conftest.py` also blocks data.gov.in
outright. If you pipe the output (into `tail`, say), use `set -o pipefail` so a failing
run still fails.

## Working on the pipeline
The timer runs `pipeline/.venv/bin/python pipeline.py` straight from the main checkout:
whatever is there at the next firing runs, uncommitted edits and packages installed into
its `.venv` included. So:
- Keep the main checkout on `main`. Never switch branches or install packages in it.
- Build each work item in its own git worktree (`git worktree add -b fix/x
  ../sentinel-x main`) with its own `pipeline/.venv`. Symlink its `pipeline/.env` and
  `pipeline/sentinel_archive.db` to the main checkout's: a non-dry run archives and then
  deletes from Supabase, so a separate archive file would strand the deleted rows.
- One work item at a time: test (`.venv/bin/python -m pytest`, then
  `PYTHONPATH=. .venv/bin/python pipeline.py --dry-run`), commit, then in the main
  checkout `git merge --ff-only <branch>`. Code that needs a migration merges only after
  Job has applied it.
- Check the next live edition. Revert only if the changed stage itself fails; an outage at
  an unrelated source (GDACS, FIRMS, OpenAQ, data.gov.in) is not a reason to revert. Keep
  the merge and report the outage.
- Removing a worktree after merging and pushing: check it is clean and merged, delete its
  two symlinks first (so nothing can reach their targets), then `git worktree remove
  <path>` (no `--force`) and `git branch -d <branch>`.
- Before pushing: no secrets (`.env`, keys) and no raw FIRMS archive in the repo.

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
product lags by roughly 2-3 months, so chunks in that gap return 0 rows — this is
expected, not a bug.

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
- Python 3.13 on the Pi (3.11 or later: `severity_config.py` uses `tomllib`)
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
- GDACS: floods, cyclones, earthquakes, wildfire alerts (search API, ~6 pages a run;
  droughts not requested; read timeout `config.GDACS_READ_TIMEOUT_S`, 90 s, the
  others keep 30 s; each page's time is logged)
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
paced on the key's transaction count; raw CSV kept outside the repo, in
`<firms-archive-dir>`):
```bash
PYTHONPATH=. .venv/bin/python tools/pull_firms_archive.py --start 2024-01-01 \
    --end 2025-12-31 --cache-dir <firms-archive-dir>
PYTHONPATH=. .venv/bin/python tools/build_fire_baseline.py \
    --cache-dir <firms-archive-dir> --upload
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
level with older data; and if no station near Poor yields a 24 h mean, the item stays
last-known rather than closing. Either way a city counts as Severe only after
`air.severe_confirm_runs` assessments in a row. With neither source usable the
item stays last-known and the reason says why. Each feed attempt updates the
DATAGOV sources row (migration 006) and pipeline_runs.sources. Tests never reach
data.gov.in (tests/conftest.py drops the key and blocks requests).

## Fire desk
`fire_desk.py` runs right after the fire stage and turns its fire_events rows
into one item per state (`fire:<state slug>`, e.g. `fire:madhya-pradesh`).
The level comes from yesterday (UTC) once FIRMS holds all of it
(`[fire.complete_day]`): its night-pass hotspots (from 14:00 UTC) must span 60+
min, i.e. two of the night pass's 2-3 orbits (18:20-22:20 UTC). Until then no
levels are set and open items keep the last complete day's levels as
last-known ("27 Oct incomplete in FIRMS (...)"). Items levelled on an
incomplete day before the rule (editions 26-27) are restored to their last
complete-day snapshot (`restore_complete_levels`), and their fire trend points
in `desk_watch` are dropped. The level: the day's fire events over the state's norm for
that week (`data/fire_baseline.csv`), counted from `fire.min_fire_events`
events; a large fire near a city (`data/india_places.csv`) is Level 4. These
FIRMS-derived levels are capped at `fire.calibration_cap` (2) until live
counts are calibrated against the archive; a current GDACS wildfire alert in
the state lifts the item to Level 3 regardless. Today's events so far are in
`figures.today` (marked partial) and never set the level. Items close after
`fire.lifecycle.close_after_hours` of complete days below Level 2
(`figures.quiet_since`). If FIRMS fails, has no rows for yesterday, or
yesterday is incomplete, open items stay last-known; if GDACS fails, they keep
their last known alerts.
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

Applied (checked 28 Oct 2026, every table and view answers): 001 pipeline_runs and
source freshness, 002 desk_items and snapshots, 003 fire_events, 004 fire_baseline,
005 quiet-day desk, 006 the DATAGOV sources row. Written 29 Oct, not yet applied: 007
read-only grants on the pre-001 tables (no code depends on it). Planned next, with the
frontend phase: a `last_known` column in the `desk_last_level3` view
(docs/severity-pipeline.md), now migration 008.

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
- Timeouts (after the retries): GDACS never fails the run; FIRMS fails it only if
  FIRMS also timed out in the previous run (`FAIL_ON_SECOND_TIMEOUT` in pipeline.py,
  read from its `sources.last_status`); other sources fail at once. Any other
  fetch error fails the run at once.
- A run that fails, or where FIRMS/USGS/OpenAQ go stale, sends an alert via
  notify.py if NOTIFY_WEBHOOK_URL is set; EONET/GDACS are event-driven and
  are never alerted on row age, only on the fetch itself failing
