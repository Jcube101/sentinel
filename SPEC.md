# Sentinel — Technical Specification

---

## Project Overview

Sentinel is a real-time natural disaster tracker for India. The pipeline
fetches data from five public APIs daily, normalises it into a consistent
schema, and upserts it into Supabase. A Vite + React frontend visualises
active events on a map.

**Goals:**
- Aggregate fire, flood, cyclone, earthquake, and air quality data for India
  into a single queryable database
- Deduplicate correctly across pipeline runs using deterministic IDs
- Never let one data source failure affect the others
- Keep the pipeline simple enough to extend with new sources in under an hour

---

## Repository Structure

```
sentinel/
├── pipeline/              — Python data pipeline
│   ├── fetchers/          — one module per data source
│   ├── pipeline.py        — orchestrator (fetch → upsert → cleanup)
│   ├── backfill.py        — historical data loader
│   ├── archive.py         — Supabase → local SQLite archiver
│   ├── config.py          — env vars + India bbox constants
│   ├── requirements.txt
│   └── render.yaml        — legacy Render cron config (unused; pipeline runs on the Pi)
└── frontend/              — Vite + React + TypeScript dashboard
    ├── src/
    │   ├── lib/            — Supabase client, types, constants
    │   ├── hooks/          — React Query data hooks
    │   ├── pages/          — Landing, Dashboard
    │   └── components/     — map, layout, ui
    ├── package.json
    └── render.yaml         — Render static site config
```

---

## Architecture

```
backfill.py (one-time)         Pi systemd timer (daily)
  ├── firms.fetch_range()         └── pipeline/pipeline.py
  ├── eonet.fetch()                     ├── fetchers/firms.py    → events table
  ├── gdacs.fetch()                     ├── fetchers/eonet.py    → events table
  └── usgs.fetch()                      ├── fetchers/gdacs.py    → events table
         │                              ├── fetchers/usgs.py     → events table
         │                              ├── fetchers/openaq.py  → aqi_readings table
         │                              └── _cleanup()           → delete stale rows
         └──────────────────────────────────────┐
                                                ▼
                                         Supabase (Postgres)
                                           │           │
                                           ▼           ▼
                                    Frontend    archive.py → sentinel_archive.db
```

---

## Data Sources

### FIRMS (NASA Fire Information for Resource Management System)
- **Endpoint:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA20_NRT/{bbox}/2`
- **Auth:** API key in URL path
- **Format:** CSV
- **Provides:** Fire hotspot latitude/longitude, FRP (fire radiative power in MW), brightness, confidence
- **Update frequency:** Near real-time (~3 hours from satellite pass)
- **India bbox:** `68.7,8.4,97.4,37.1` (west,south,east,north)
- **Day range is 2, not 1:** VIIRS NOAA-20 overpasses India around 06:00-08:00
  UTC. The trailing path segment is the current UTC calendar day, not a
  rolling 24 hours, so a pipeline run scheduled before the overpass queries a
  day that hasn't happened yet. `2` covers today and yesterday; upserts
  dedupe by deterministic `id`, so the overlap is harmless. Never drop this
  back to `1` without also confirming every scheduled run happens after
  08:00 UTC.

### EONET (NASA Earth Observatory Natural Event Tracker)
- **Endpoint:** `https://eonet.gsfc.nasa.gov/api/v3/events`
- **Auth:** None
- **Format:** JSON
- **Provides:** Named wildfire and severe storm events with geometry tracks
- **Parameters:** `status=all`, `category=wildfires,severeStorms`, `days=30`, `bbox=68.7,8.4,97.4,37.1`
- **Update frequency:** Real-time

### GDACS (Global Disaster Alert and Coordination System)
- **Endpoint:** `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH`
- **Auth:** None
- **Format:** GeoJSON FeatureCollection
- **Provides:** Floods, cyclones, earthquakes, wildfires with alert levels (Green/Orange/Red)
- **Parameters:** `eventtypes=EQ,TC,FL,WF`, `country=IND`, rolling 90-day window
- **Note:** Country filter is not strict — requires post-fetch bbox filter
- **Update frequency:** Event-driven

### USGS Earthquake Hazards Program
- **Endpoint:** `https://earthquake.usgs.gov/fdsnws/event/1/query`
- **Auth:** None
- **Format:** GeoJSON FeatureCollection
- **Provides:** Earthquake magnitude, depth, location, review status
- **Parameters:** India bbox, `minmagnitude=4.0`, `limit=500`, rolling 90-day window
- **Update frequency:** Real-time

### OpenAQ v3
- **Endpoint:** `https://api.openaq.org/v3/locations` + `/sensors`
- **Auth:** API key in `X-API-Key` header
- **Format:** JSON
- **Provides:** PM2.5, PM10, NO2, SO2, O3 readings from ground stations
- **Country ID:** `9` (India) — numeric, not ISO code
- **Limit:** 50 locations per run, 0.5s delay between sensor requests
- **Update frequency:** Hourly per station

---

## Supabase Schema

### events table

| Column | Type | Notes |
|--------|------|-------|
| id | text | Primary key. Deterministic, built from source fields |
| external_id | text | Original ID from source API |
| source | text | `FIRMS` \| `EONET` \| `GDACS` \| `USGS` |
| category | text | `fire` \| `flood` \| `cyclone` \| `earthquake` |
| title | text | Human-readable event name |
| description | text | Detail string including key metrics |
| severity | text | `low` \| `medium` \| `high` \| `extreme` |
| severity_value | numeric | Raw numeric severity (FRP, magnitude, etc.) |
| severity_unit | text | Unit for severity_value (MW, mb, mww, etc.) |
| status | text | `open` \| `closed` |
| started_at | timestamptz | Event start time |
| closed_at | timestamptz | Event end time (null if open) |
| latitude | numeric | Most recent known latitude |
| longitude | numeric | Most recent known longitude |
| place_name | text | Human-readable location string |
| geometry | jsonb | GeoJSON geometry (Point or GeometryCollection for tracks) |
| source_url | text | Link to source event page |
| raw | jsonb | Full original API response for the event |
| created_at | timestamptz | Set by Supabase on first insert |
| updated_at | timestamptz | Set by Supabase on each upsert |

**Upsert conflict key:** `id`

### aqi_readings table

| Column | Type | Notes |
|--------|------|-------|
| id | bigint | Auto-increment primary key |
| location_id | text | OpenAQ location ID |
| location_name | text | Station name |
| city | text | City / locality (may be null) |
| latitude | numeric | |
| longitude | numeric | |
| parameter | text | `pm25` \| `pm10` \| `no2` \| `so2` \| `o3` |
| value | numeric | Reading value |
| unit | text | e.g. `µg/m³`, `ppb` |
| recorded_at | timestamptz | When the reading was taken |
| created_at | timestamptz | Set by Supabase on insert |

**Upsert conflict key:** `(location_id, parameter, recorded_at)` — requires unique constraint:
```sql
ALTER TABLE aqi_readings ADD CONSTRAINT aqi_readings_location_param_time_key
UNIQUE (location_id, parameter, recorded_at);
```

---

## Pipeline Design

### Fetcher Interface Contract

Every fetcher must:
1. Export a `fetch() -> List[dict]` function
2. Return dicts whose keys exactly match the target table schema
3. Handle per-row/per-feature errors internally (log and skip), but let
   top-level request or response-parse failures propagate; `pipeline.py`
   catches those and marks the source failed for the run. A legitimately
   empty result must still return `[]` successfully.
4. Log clearly: source name, rows fetched, any errors
5. Use deterministic IDs — never random UUIDs

### Deduplication

Before every upsert, rows are deduplicated by `id` (keeping the last
occurrence). This is required because Postgres raises an error if the same
`id` appears twice in a single `INSERT ... ON CONFLICT` payload. The
`_dedup()` helper in both `pipeline.py` and `backfill.py` handles this.

### Batching

`pipeline.py` and `backfill.py` upsert in batches of 500 rows to stay within
Supabase's request payload limits. Batching is handled by `_chunks()`.

### Archive-then-cleanup

`archive.run()` runs immediately before `_cleanup()` inside every
`pipeline.run()` call, in-process rather than on a separate schedule that
could drift out of order relative to cleanup. If archiving raises or exits
non-zero, cleanup is skipped for that run and the pipeline exits non-zero:
silently deleting un-archived data was the exact failure mode this closes.
`archive.run()` only reads from Supabase and writes locally via `INSERT OR
REPLACE`, so it's idempotent and safe to run multiple times a day.

### Cleanup

`_cleanup()` runs at the end of every `pipeline.run()`, gated on a
successful archive:
- FIRMS / GDACS events: deleted after 60 days
- EONET / USGS events: deleted after 365 days (low volume)
- AQI readings: deleted after 7 days

Each delete is wrapped in its own `try/except` — a failure in one does not
affect the others or the pipeline exit code.

### Error Isolation

- Each fetcher is wrapped in `try/except` inside `pipeline.py`'s
  `_run_fetcher()`. A fetcher's *own* per-row/per-feature errors are handled
  internally (see Fetcher Interface Contract above); a request or
  response-parse failure propagates out of `fetch()` and is caught here,
  which marks that source failed for the run without halting the others.
- Exit code is `1` if any fetcher, upsert, or archive failed, `0` on full
  success.
- `_check_staleness()` runs at the end of every call, regardless of exit
  code: it logs the newest row's age per source and warns when a source
  exceeds its expected freshness window (2 days for FIRMS/OpenAQ, 30 for
  USGS, 60 for the event-driven EONET/GDACS). This does not affect the exit
  code. It's a log signal for whoever is watching `pipeline/logs/pipeline.log`,
  not a hard failure.

### ID Formats

| Source | ID format |
|--------|-----------|
| FIRMS | `FIRMS-{lat}-{lon}-{acq_date}-{acq_time}` |
| EONET | `EONET-{eonet_event_id}` |
| GDACS | `GDACS-{eventtype}-{eventid}` |
| USGS | `USGS-{geojson_feature_id}` |

---

## Frontend Spec

**Stack:** Vite + React + TypeScript + MapLibre GL JS + Recharts

**Design system:** Dark (#0a0a0f), amber accent (#f97316), Inter/DM Sans

**Map:**
- Base layer: MapLibre GL with dark OpenFreeMap tiles
- Initial view: lon 82.8, lat 22.5, zoom 4.2
- Event markers: coloured by category (fire=#ef4444, flood=#3b82f6, cyclone=#8b5cf6, earthquake=#f59e0b)
- Supercluster clustering for dense FIRMS hotspots
- Click: opens event detail panel

**Event detail panel:**
- Bottom sheet on mobile, side panel on desktop
- Event title, category badge, severity badge
- Started/closed dates
- Place name + coordinates
- Source link
- Description

**Filters:**
- Toggle by category
- Toggle by status (open/closed/all)
- Days range selector (7/30/90)

**AQI overlay (V2):**
- Station markers with colour-coded AQI value
- Tooltip showing parameter breakdown

**Stats bar:**
- Total open events count
- Count by category (Recharts bar chart)
- Last pipeline run timestamp

---

## Backfill

`backfill.py` loads historical event data into the `events` table. It accepts
`--source` (`all` | `firms` | `eonet` | `gdacs` | `usgs`) and `--days` arguments.

**FIRMS chunking:** 5-day windows; `VIIRS_NOAA20_NRT` for chunks within the
last 10 days, `VIIRS_NOAA20_SP` for older data. SP has a ~2-month processing
lag — chunks in that window return 0 rows (expected).

**USGS chunking:** 90-day windows to avoid the 20,000-result API cap.

---

## Archive

`archive.py` copies old Supabase data to a local SQLite database
(`sentinel_archive.db`) before cleanup removes it from Supabase.

- Events older than 30 days
- AQI readings older than 7 days
- SQLite schema mirrors Supabase exactly (TEXT for timestamptz, REAL for numeric,
  TEXT for jsonb with JSON serialization)
- Uses `INSERT OR REPLACE` — safe to run multiple times
- Paginates Supabase reads in 1000-row batches
- Never deletes from Supabase

**Scheduling:** `pipeline.py` calls `archive.run()` directly, immediately
before cleanup, on every invocation; see Archive-then-cleanup above.
`pipeline/setup_task_scheduler.ps1` (Windows Task Scheduler) predates that
and is legacy/unused on the Pi.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key from Project Settings → API |
| `FIRMS_MAP_KEY` | NASA FIRMS MAP key |
| `OPENAQ_API_KEY` | OpenAQ v3 API key |

---

## Deployment

**Pipeline:** Raspberry Pi (`jobpi`)
- Host: self-hosted Raspberry Pi 5
- Scheduler: systemd timer pair (`sentinel-pipeline.service` + `sentinel-pipeline.timer`)
- Schedule: three times daily at 09:00, 15:00, 21:00 UTC (`OnCalendar=*-*-*
  09,15,21:00:00 UTC`), `Persistent=true` to catch missed runs. Chosen to
  land after the ~06:00-08:00 UTC VIIRS overpass FIRMS depends on; the
  original single 01:00 UTC run predated that overpass every day (see
  LEARNINGS.md).
- ExecStart: `pipeline/.venv/bin/python pipeline.py` (WorkingDirectory `pipeline/`)
- Venv: `pipeline/.venv`
- Logs: `pipeline/logs/pipeline.log` (rotating, 5MB × 7 backups, gitignored)
  is the durable log; journald on this host (`journalctl -u
  sentinel-pipeline.service`) evicts entries within hours because other
  services on the Pi generate high journal volume. See README.md's Pi
  Deployment & Operations section for the full runbook.

**Frontend service:** Render
- Type: Static Site
- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**Environment variables:** Pipeline keys live in `pipeline/.env` on the Pi; frontend keys are set in the Render dashboard, matching the `.env` keys above

---

## Frontend Stack

- React 19 + TypeScript 6
- Tailwind CSS 3
- MapLibre GL JS + react-map-gl v8 + supercluster
- Supabase client (`@supabase/supabase-js`) + React Query (`@tanstack/react-query`)
- React Router (`react-router-dom`)
- Recharts
- Lucide icons

**Path alias:** `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`)
