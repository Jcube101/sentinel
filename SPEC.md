# Sentinel — Technical Specification

---

## Project Overview

Sentinel is a real-time natural disaster tracker for India. The pipeline
fetches data from five public APIs every 30 minutes, normalises it into a
consistent schema, and upserts it into Supabase. A frontend map visualises
active events.

**Goals:**
- Aggregate fire, flood, cyclone, earthquake, and air quality data for India
  into a single queryable database
- Deduplicate correctly across pipeline runs using deterministic IDs
- Never let one data source failure affect the others
- Keep the pipeline simple enough to extend with new sources in under an hour

---

## Architecture

```
backfill.py (one-time)         Render Cron (every 30 min)
  ├── firms.fetch_range()         └── pipeline.py
  ├── eonet.fetch()                     ├── fetchers/firms.py    → events table
  ├── gdacs.fetch()                     ├── fetchers/eonet.py    → events table
  └── usgs.fetch()                      ├── fetchers/gdacs.py    → events table
         │                              ├── fetchers/usgs.py     → events table
         │                              └── fetchers/openaq.py  → aqi_readings table
         └──────────────────────────────────────┐
                                                ▼
                                         Supabase (Postgres)
                                                │
                                                ▼
                                         Frontend (MapLibre GL + Recharts)
```

---

## Data Sources

### FIRMS (NASA Fire Information for Resource Management System)
- **Endpoint:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_NOAA20_NRT/{bbox}/1`
- **Auth:** API key in URL path
- **Format:** CSV
- **Provides:** Fire hotspot latitude/longitude, FRP (fire radiative power in MW), brightness, confidence
- **Update frequency:** Near real-time (~3 hours from satellite pass)
- **India bbox:** `68.7,8.4,97.4,37.1` (west,south,east,north)

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
3. Handle all exceptions internally — never raise to the caller
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

### Error Isolation

- Each fetcher is wrapped in `try/except` inside `pipeline.py`
- A fetcher failure sets a flag but does not halt the pipeline
- Exit code is `1` if any fetcher or upsert failed, `0` on full success

### ID Formats

| Source | ID format |
|--------|-----------|
| FIRMS | `FIRMS-{lat}-{lon}-{acq_date}-{acq_time}` |
| EONET | `EONET-{eonet_event_id}` |
| GDACS | `GDACS-{eventtype}-{eventid}` |
| USGS | `USGS-{geojson_feature_id}` |

---

## Frontend Spec (Phase 3)

**Stack:** Next.js, MapLibre GL JS, Recharts

**Map:**
- Base layer: MapLibre GL with a neutral dark tile style
- Event markers: coloured by category (fire=orange, earthquake=red, flood=blue, cyclone=purple)
- Marker size: scaled by severity
- Click: opens event detail sidebar

**Sidebar:**
- Event title, category badge, severity badge
- Started/closed dates
- Place name + coordinates
- Source link
- Description

**Filters:**
- Toggle by category
- Toggle by severity
- Toggle open/closed

**AQI overlay:**
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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key from Project Settings → API |
| `FIRMS_MAP_KEY` | NASA FIRMS MAP key |
| `OPENAQ_API_KEY` | OpenAQ v3 API key |

---

## Deployment

**Platform:** Render

**Service type:** Cron Job

**Schedule:** `*/30 * * * *` (every 30 minutes)

**Command:** `python pipeline.py`

**Build command:** `pip install -r requirements.txt`

**Environment variables:** Set in Render dashboard, matching `.env` keys above
