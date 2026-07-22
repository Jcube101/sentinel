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
└── frontend/              — Vite + React + TypeScript app
    ├── src/
    │   ├── lib/            — Supabase client, types, time/severity helpers
    │   ├── hooks/          — React Query data hooks
    │   ├── pages/          — Landing (Home), LiveMap, Insights, EventDetail, About
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
  code, and never affects it: staleness is a notification concern (see
  Alerting below), not a hard failure.

### Staleness thresholds: dense vs event-driven sources

Thresholds are set from actual history in Supabase, not from guessing at
each API's documented cadence:

| Source | Classification | Threshold | Why |
|--------|----------------|-----------|-----|
| FIRMS | Dense | 2 days | Active essentially every UTC day in the observed history |
| USGS | Dense | 7 days | Worst observed gap between active days (M4+, this bbox) in the last 50 rows was 7 days; old threshold was 30 |
| OpenAQ (aqi_readings) | Dense | 48 hours | Documented hourly-per-station cadence |
| EONET | Event-driven | not row-age-checked | Own history has a 28-day gap between active days with nothing wrong; a live probe found 0 events in the trailing 30 days but 178 in the trailing 180, confirming the current ~50-day gap is a real lull, not a broken fetcher |
| GDACS | Event-driven | not row-age-checked | Median historical gap of 5 days between active days but with real multi-week quiet stretches; India-relevant events are inherently rare in this feed |

For dense sources, `_check_staleness()` warns and calls `notify.send_alert()`
when the newest row exceeds the threshold. For event-driven sources, the row
age is still logged at `INFO` every run for visibility, but never triggers a
`WARNING` or an alert, because a real quiet month and a silently broken
fetcher produce an identical "no new rows" signal for a source whose true
event rate is naturally sparse and irregular. The reliable tripwire for
these two is whether the fetch itself succeeded, which already fails the run
via `_run_fetcher()` and reaches `OnFailure=` (see Alerting below)
regardless of source classification.

Any source, dense or event-driven, with literally zero rows on record is
still treated as a distinct failure and alerted on: never having ingested a
single row is a meaningfully stronger signal than "went quiet after being
active," and is a plausible real bootstrap or configuration failure rather
than a normal lull.

### Alerting

A failed run and a dense-source staleness breach both notify through
`notify.py`, which POSTs `{source, subject, body}` JSON to
`NOTIFY_WEBHOOK_URL` if set. If unset, `send_alert()` logs and returns
`False` instead of raising, so a missing or broken alert channel can never
itself break the run it's trying to report on.

`NOTIFY_WEBHOOK_URL` currently points at an n8n workflow ("Sentinel
Alerts") whose webhook trigger forwards to a Gmail send node. Delivery and
the Gmail credential live entirely in n8n; Sentinel posts a generic JSON
payload and holds no mail credentials of its own. See README.md's Alerting
section for the live test commands. The webhook is unauthenticated by
design for now, treat the URL itself as sensitive since it's the only
access control in front of it.

Two call sites:
- `_check_staleness()` inside `pipeline.py`, in-process, for dense-source
  staleness and the zero-rows-ever case.
- `notify_failure.py`, a separate entry point invoked by a dedicated
  `sentinel-pipeline-alert.service` unit via `sentinel-pipeline.service`'s
  `OnFailure=` directive. This exists specifically to catch failures the
  pipeline process cannot self-report (an interpreter crash, an OOM kill,
  anything that ends the process before its own code runs), gathering
  `systemctl show` output and the tail of the durable logfile into one alert
  with no secrets in it.

### ID Formats

| Source | ID format |
|--------|-----------|
| FIRMS | `FIRMS-{lat}-{lon}-{acq_date}-{acq_time}` |
| EONET | `EONET-{eonet_event_id}` |
| GDACS | `GDACS-{eventtype}-{eventid}` |
| USGS | `USGS-{geojson_feature_id}` |

---

## Frontend Spec

**Stack:** Vite + React + TypeScript + Leaflet + Recharts + React Router

**Design system:** Dark (#0a0a0f), amber accent (#f97316), Inter — values live as
CSS custom properties in `src/index.css` (`--bg`, `--surface`, `--border`,
`--text`, `--muted`, `--accent`, `--cat-*` category hues, `--sev-*` severity
ramp), aliased in `tailwind.config.js`.

**Routes (Phase 4, Jul 2026):**
| Route | Page | Purpose |
|-------|------|---------|
| `/` | Home (`Landing.tsx`) | Hero, live status line, Active Threats feed, category strip, mini-map preview |
| `/map` | Live Map (`LiveMap.tsx`) | Full-bleed map + filters + detail panel + AQI panel |
| `/insights` | Insights | Recharts analytics: events over time, severity distribution, regions, open/closed, AQI leaderboard |
| `/event/:id` | Event detail | Single event, locator map, nearby events |
| `/about` | About | Methodology, data sources, scope, disclaimer |
| `/dashboard` | — | Redirects to `/map` (legacy bookmarks) |

**Map:**
- Base layer: Leaflet with CARTO dark raster tiles (renders as DOM `<img>` tiles, so it needs no WebGL — replaces an earlier MapLibre map that showed a blank void when WebGL was unavailable)
- Initial view: lon 82.8, lat 22.5, zoom 4
- Event markers: coloured by category (fire=#ef4444, flood=#3b82f6, cyclone=#8b5cf6, earthquake=#f59e0b)
- Supercluster clustering for dense FIRMS hotspots
- `SentinelMap` also supports a non-interactive mode (drag/zoom disabled) and a `center`/`zoom` override, used by the Home mini-map preview and the Event detail locator map
- Click: opens event detail panel

**Event detail panel / page:**
- Bottom sheet on mobile, side panel on desktop (panel); full page at `/event/:id`
- Event title, category badge, severity badge, relative-time line, severity meter (0-100, see `lib/severity.ts`)
- Started/closed dates
- Place name + coordinates
- Source link + "View full page" link (panel only)
- Description
- Event detail page adds: locator map, nearby events (client-side, ~1° box, sorted by distance)

**Filters:**
- Toggle by category (grouped, labeled segments: Category | Status | Window | AQI)
- Toggle by status (open/closed/all)
- Days range selector (7/30/90)
- Clear-filters affordance when filters differ from defaults
- Command palette (Ctrl-K or a search icon button) — searches loaded event titles/places, navigates to `/event/:id`

**AQI panel (shipped Jul 2026):**
- `AqiPanel.tsx`, toggled from a button in the filter bar, reuses
  `EventDetailPanel`'s exact slide-in construction (bottom sheet on mobile,
  fixed panel on desktop), anchored left instead of right so the two panels
  never collide when both are open
- Queries `aqi_readings` directly via `useAqiReadings` (last 24h), grouped
  by station, sorted worst-PM2.5-first
- Latest PM2.5 per station with an indicative CPCB/EPA-style color band, an
  up/down trend arrow computed from the oldest vs newest PM2.5 reading
  already in the fetched window, and the other pollutants read at that
  station
- **Not yet built:** map overlay with color-coded station markers and a
  hover tooltip, this panel is a list view, not a map layer

**Stats bar:**
- Count by category (plain counts, not a chart)
- Worst current PM2.5 reading (station name + value)
- Relative time since the most recently-started loaded event, as a proxy for
  "last updated" — not an actual pipeline-run timestamp, there is no
  `pipeline_runs` table

**Insights page (Phase 4, Jul 2026):** `/insights`, Recharts, all derived from
the existing `events`/`aqi_readings` queries over a 90-day window — no new
tables:
- Events by category over time (stacked area, daily buckets)
- Severity distribution per category (bucketed by the normalized `severity`
  label, not raw `severity_value` — that field's units aren't comparable
  even within one category, e.g. USGS magnitude vs. GDACS alert-level numerics
  for earthquakes)
- Most-affected regions (top `place_name` by count; events with no
  `place_name` — mostly raw FIRMS hotspots — are excluded rather than lumped
  into an "Unknown" bucket that would dwarf every real place)
- Open vs. closed ratio + median duration
- AQI leaderboard (worst current PM2.5 stations)

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
before cleanup, on every invocation; see Archive-then-cleanup above. Windows
Task Scheduler archival is fully retired: `setup_task_scheduler.ps1` has
been removed from the repo and the Windows scheduled task has been
disabled. Archival has no Windows or Render component; it runs only on the
Pi.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key from Project Settings → API |
| `FIRMS_MAP_KEY` | NASA FIRMS MAP key |
| `OPENAQ_API_KEY` | OpenAQ v3 API key |
| `NOTIFY_WEBHOOK_URL` | Optional. Failure/staleness alert webhook, see Alerting above |

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
- Alerting: `sentinel-pipeline.service` has `OnFailure=sentinel-pipeline-alert.service`,
  a separate oneshot unit that runs `notify_failure.py`. See Alerting above.

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
- Leaflet + react-leaflet v5 + supercluster
- Supabase client (`@supabase/supabase-js`) + React Query (`@tanstack/react-query`)
- React Router (`react-router-dom`)
- Recharts
- Lucide icons

**Path alias:** `@/` maps to `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`)
