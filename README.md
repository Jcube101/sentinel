# Sentinel

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Made with Claude](https://img.shields.io/badge/Made%20with-Claude-blueviolet)](https://claude.ai)

**Real-time natural disaster tracker for India.**

Sentinel fetches fire hotspots, earthquakes, floods, cyclones, and air quality readings from five public APIs and upserts them into Supabase every 30 minutes. A frontend map (in progress) visualises active events across India.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Render Cron (30 min)                  │
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
                                    │  Frontend (WIP) │
                                    │  job-joseph.com │
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
- **python-dateutil** — timestamp parsing
- **Supabase** — Postgres database + REST API
- **Render** — cron job host

---

## Getting Started

### 1. Clone and set up environment

```bash
git clone https://github.com/Jcube101/sentinel-pipeline.git
cd sentinel-pipeline
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials (see table below).

### 3. Run the pipeline

```bash
PYTHONPATH=. python pipeline.py
```

### 4. Run a single fetcher

```bash
PYTHONPATH=. python -m fetchers.firms
PYTHONPATH=. python -m fetchers.eonet
PYTHONPATH=. python -m fetchers.gdacs
PYTHONPATH=. python -m fetchers.usgs
PYTHONPATH=. python -m fetchers.openaq
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (from Project Settings → API) |
| `FIRMS_MAP_KEY` | Yes | NASA FIRMS MAP key — register at [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/area/) |
| `OPENAQ_API_KEY` | Yes | OpenAQ API key — register at [explore.openaq.org](https://explore.openaq.org/) |

See `.env.example` for the exact format.

---

## Project Structure

```
sentinel-pipeline/
├── config.py              # env vars + India bounding box constants
├── pipeline.py            # main orchestrator — runs all fetchers, upserts to Supabase
├── backfill.py            # historical data loader (in progress)
├── requirements.txt
├── render.yaml            # Render cron job config
├── .env.example
├── fetchers/
│   ├── __init__.py
│   ├── firms.py           # NASA FIRMS fire hotspots
│   ├── eonet.py           # NASA EONET wildfires + severe storms
│   ├── gdacs.py           # GDACS floods, cyclones, earthquakes
│   ├── usgs.py            # USGS earthquakes
│   └── openaq.py          # OpenAQ air quality readings
├── CLAUDE.md              # instructions for Claude Code
├── SPEC.md                # technical specification
├── ROADMAP.md             # project roadmap
├── LEARNINGS.md           # lessons learned during build
└── CONTRIBUTING.md        # contribution guide
```

---

## How It Works

1. **Fetch** — each fetcher calls its API, parses the response, and returns a `List[dict]` matching the Supabase schema exactly
2. **Transform** — severity levels, categories, and deterministic IDs are computed during fetch
3. **Upsert** — `pipeline.py` collects all events and bulk-upserts to Supabase in batches of 500, using the deterministic `id` field as the conflict key so re-runs never create duplicates
4. **Schedule** — Render runs `pipeline.py` every 30 minutes via cron

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
