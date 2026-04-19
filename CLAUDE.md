# Sentinel Pipeline

Python data pipeline for the Sentinel natural disaster tracker.
Fetches from 5 APIs and upserts to Supabase every 30 minutes via Render cron.

## Status
All 5 fetchers complete and validated. pipeline.py and backfill.py working end-to-end.
- FIRMS → ~5,800 fire hotspot events (pipeline); ~97,245 events backfilled (30 days)
- EONET → ~93 events (wildfires + severe storms)
- GDACS → ~47 events (floods, cyclones, earthquakes)
- USGS → ~102 earthquake events
- OpenAQ → ~200 AQI readings

## How to Run

Full pipeline:
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

## Backfill

Run historical load:
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
- Uses INSERT OR REPLACE — safe to run multiple times
- Does NOT delete from Supabase (cleanup is handled by pipeline.py)

To set up automatic daily archival on Windows logon (Mon–Fri), run once:
```
setup_task_scheduler.bat
```
This creates a Windows Task Scheduler task named "Sentinel Archive".

## Cleanup (auto, runs inside pipeline.py)

`_cleanup()` runs at the end of every `pipeline.run()`:
- FIRMS / GDACS events: keep 60 days
- EONET / USGS events: keep 365 days
- AQI readings: keep 7 days

## Next Steps
- Render deployment: cron job running pipeline.py every 30 minutes
- Environment variables on Render dashboard

## Stack
- Python 3.11
- supabase-py
- requests
- python-dotenv
- python-dateutil

## Environment Variables
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
- FIRMS_MAP_KEY
- OPENAQ_API_KEY

## Data Sources
- FIRMS: fire hotspots (India bbox: 68.7,8.4,97.4,37.1)
- EONET: cyclones + wildfires (category filter + India bbox)
- GDACS: floods, cyclones, earthquakes (GeoJSON feed)
- USGS: earthquakes (India bbox, min magnitude 4.0)
- OpenAQ: AQI readings for Indian cities (PM2.5, PM10, NO2)

## Supabase Tables
- events: all disaster events
- aqi_readings: air quality readings

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
- IDs must be deterministic — built from source data, never random UUIDs
- Always upsert, never plain insert (conflict key: id column)
- One fetcher must never crash the whole pipeline — wrap each in try/except
- Log clearly: source name, rows fetched, rows upserted, any errors
- Never hardcode credentials — always read from environment variables