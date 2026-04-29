# Sentinel

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Made with Claude](https://img.shields.io/badge/Made%20with-Claude-blueviolet)](https://claude.ai)

**Real-time natural disaster tracker for India.**

Sentinel fetches fire hotspots, earthquakes, floods, cyclones, and air quality readings from five public APIs and upserts them into Supabase every day. A frontend map visualises active events across India.

---

## Structure

```
sentinel/
├── pipeline/    — Python data pipeline
│   ├── fetchers/
│   ├── pipeline.py
│   ├── backfill.py
│   ├── archive.py
│   ├── config.py
│   ├── requirements.txt
│   └── render.yaml
└── frontend/    — Vite + React + TypeScript dashboard
    ├── src/
    │   ├── lib/          — Supabase client, types
    │   ├── hooks/        — React Query data hooks
    │   ├── pages/        — Landing, Dashboard
    │   └── components/   — map, layout, ui
    ├── package.json
    └── render.yaml
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Render Cron (daily)                   │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   pipeline.py   │  orchestrator
              └────────┬────────┘
        ┌──────────────┼──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   fetchers/      fetchers/      fetchers/      fetchers/      fetchers/
   firms.py       eonet.py       gdacs.py       usgs.py        openaq.py
   (NASA FIRMS)   (NASA EONET)   (GDACS)        (USGS)         (OpenAQ)
        │              │              │              │              │
        └──────────────┴──────┬───────┴──────────────┘              │
                              ▼                                      ▼
                     ┌──────────────┐                    ┌──────────────────┐
                     │    events    │                    │   aqi_readings   │
                     │   (Supabase) │                    │    (Supabase)    │
                     └──────────────┘                    └──────────────────┘
                              │                                      │
                              └──────────────┬───────────────────────┘
                                             ▼
                                    ┌─────────────────┐
                                    │    Frontend     │
                                    │  (Render static)│
                                    └─────────────────┘
```

---

## Data Sources

| Source | What it provides | Auth | Update frequency |
|--------|-----------------|------|-----------------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Fire hotspots (VIIRS NOAA-20) | API key | Near real-time |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Wildfires, severe storms | None | Real-time |
| [GDACS](https://www.gdacs.org/) | Floods, cyclones, earthquakes | None | Event-driven |
| [USGS Earthquake Hazards](https://earthquake.usgs.gov/fdsnws/event/1/) | Earthquakes (M4.0+) | None | Real-time |
| [OpenAQ v3](https://api.openaq.org/) | PM2.5, PM10, NO2, SO2, O3 | API key | Hourly |

---

## Tech Stack

- **Python 3.11**
- **supabase-py** — database client
- **requests** — HTTP
- **python-dotenv** — environment variables
- **Supabase** — Postgres database + REST API
- **Render** — cron job + static site host
- **Vite + React 19 + TypeScript** — frontend
- **Tailwind CSS + MapLibre GL + Recharts** — styling, map, charts
- **React Query + Supabase client** — frontend data layer

---

## Getting Started

### 1. Clone and set up environment

```bash
git clone https://github.com/Jcube101/sentinel.git
cd sentinel/pipeline
python -m venv venv
source venv/Scripts/activate  # Windows Git Bash
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials.

### 3. Run the pipeline

```bash
cd sentinel/pipeline
python pipeline.py
```

### 4. Run a single fetcher

```bash
python -m fetchers.firms
python -m fetchers.eonet
python -m fetchers.gdacs
python -m fetchers.usgs
python -m fetchers.openaq
```

### 5. Backfill historical data

```bash
python backfill.py --source all --days 90
python backfill.py --source firms --days 30
python backfill.py --source usgs --days 365
```

### 6. Archive old data to local SQLite

```bash
python archive.py
```

Archives events older than 30 days and AQI readings older than 7 days to `sentinel_archive.db`.

### 7. Set up automatic archival (Windows)

Run once as Administrator in PowerShell:
```powershell
.\setup_task_scheduler.ps1
```

---

## Data Retention

`pipeline.py` runs cleanup at the end of every execution:

| Data | Retention in Supabase |
|------|-----------|
| FIRMS / GDACS events | 60 days |
| EONET / USGS events | 365 days |
| AQI readings | 7 days |

Old data is archived locally via `archive.py` before deletion.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `FIRMS_MAP_KEY` | Yes | NASA FIRMS MAP key |
| `OPENAQ_API_KEY` | Yes | OpenAQ API key |

See `pipeline/.env.example` for the pipeline and `frontend/.env.example` for the frontend.

---

## Frontend Dev

```bash
cd frontend
npm install
cp .env.example .env.local
# fill in Supabase anon key in .env.local
npm run dev
```

---

## How It Works

1. **Fetch** — each fetcher calls its API and returns `List[dict]` matching the Supabase schema exactly
2. **Transform** — severity levels, categories, and deterministic IDs computed during fetch
3. **Upsert** — `pipeline.py` bulk-upserts to Supabase in batches of 500 using deterministic `id` as conflict key
4. **Cleanup** — deletes stale rows at end of every run
5. **Archive** — `archive.py` copies old data to local SQLite before it ages out of Supabase
6. **Schedule** — Render runs `pipeline.py` daily via cron

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
