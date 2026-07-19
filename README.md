# Sentinel

[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](https://www.python.org/downloads/release/python-3110/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Made with Claude](https://img.shields.io/badge/Made%20with-Claude-blueviolet)](https://claude.ai)

**Real-time natural disaster tracker for India.**

Sentinel fetches fire hotspots, earthquakes, floods, cyclones, and air quality readings from five public APIs and upserts them into Supabase every day. A frontend map visualises active events across India.

## Live Demo
https://sentinel-frontend-8hem.onrender.com

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
│   └── render.yaml     (legacy Render cron config, unused; pipeline runs on the Pi)
└── frontend/    — Vite + React map interface (live at sentinel-frontend-8hem.onrender.com)
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
│    Raspberry Pi systemd timer (3x daily, 09/15/21 UTC)  │
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
                                    ┌─────────────────────┐
                                    │      Frontend       │
                                    │   (Render static)   │
                                    │ sentinel-frontend-  │
                                    │ 8hem.onrender.com   │
                                    └─────────────────────┘
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
- **Raspberry Pi (jobpi)**: pipeline runs via a systemd timer pair, three times daily
- **Render** — frontend static site host
- **Vite + React 19 + TypeScript** — frontend
- **Tailwind CSS + MapLibre GL + Recharts** — styling, map, charts
- **React Query + Supabase client** — frontend data layer

---

## Getting Started

### 1. Clone and set up environment

```bash
git clone https://github.com/Jcube101/sentinel.git
cd sentinel/pipeline
python -m venv .venv
source .venv/bin/activate
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

Add `--dry-run` to run the fetchers and log what would happen, without writing
to Supabase or running cleanup:

```bash
python pipeline.py --dry-run
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

`pipeline.py` runs `archive.py` automatically, immediately before cleanup, on
every invocation, so this is not something you need to schedule separately. To
run it on its own (for example to inspect `sentinel_archive.db` without
running the full pipeline):

```bash
python archive.py
```

Archives events older than 30 days and AQI readings older than 7 days to
`sentinel_archive.db`. Safe to run any number of times: uses `INSERT OR
REPLACE`, and never deletes anything from Supabase.

`pipeline/setup_task_scheduler.ps1` (Windows Task Scheduler) is legacy from
before the pipeline moved to the Pi and is unused; archival no longer needs
separate scheduling on any platform.

---

## Data Retention

`pipeline.py` runs `archive.py` and then cleanup at the end of every execution:

| Data | Retention in Supabase |
|------|-----------|
| FIRMS / GDACS events | 60 days |
| EONET / USGS events | 365 days |
| AQI readings | 7 days |

Old data is archived locally via `archive.py` before deletion. If archiving
fails for any reason, that run skips cleanup entirely rather than deleting
un-archived data, and the pipeline exits non-zero.

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

1. **Fetch**: each fetcher calls its API and returns `List[dict]` matching the Supabase schema exactly. A failed request or a malformed response propagates and fails that source; an empty result from a healthy API does not.
2. **Transform** — severity levels, categories, and deterministic IDs computed during fetch
3. **Upsert** — `pipeline.py` bulk-upserts to Supabase in batches of 500 using deterministic `id` as conflict key
4. **Archive**: `archive.py` copies old data to local SQLite before cleanup can age it out of Supabase; if archiving fails, cleanup is skipped for that run
5. **Cleanup**: deletes stale rows at the end of every run, gated on a successful archive
6. **Staleness check**: logs the newest row's age per source, and warns if a source that should be fresh has gone quiet
7. **Schedule**: a systemd timer on the Raspberry Pi (jobpi) runs `pipeline.py` three times daily, at 09:00, 15:00, and 21:00 UTC

---

## Pi Deployment & Operations

The pipeline runs on a Raspberry Pi (`jobpi`) as a systemd timer + oneshot
service pair. This section is the operational reference for that setup.

### Unit files

`/etc/systemd/system/sentinel-pipeline.timer`:
```ini
[Unit]
Description=Run Sentinel pipeline three times daily, past the VIIRS overpass window (09:00, 15:00, 21:00 UTC)

[Timer]
OnCalendar=*-*-* 09,15,21:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/sentinel-pipeline.service`:
```ini
[Unit]
Description=Sentinel Natural Disaster Pipeline
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/home/jcube/projects/sentinel/pipeline/.venv/bin/python pipeline.py
WorkingDirectory=/home/jcube/projects/sentinel/pipeline
User=jcube
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal
```

`OnCalendar` is pinned in UTC to stay correct regardless of the Pi's local
timezone (IST). `systemctl list-timers` displays the next run converted to
local time. That's expected, not a bug; see [LEARNINGS.md](LEARNINGS.md).

`Persistent=true` means a run missed while the Pi was powered off fires once
on the next boot instead of being silently skipped.

### Operational commands

```bash
# Is the timer active, and when does it fire next?
systemctl list-timers sentinel-pipeline.timer

# Timer + service status, including the last run's exit code
systemctl status sentinel-pipeline.timer
systemctl status sentinel-pipeline.service

# Trigger a run right now (blocks until it finishes, Type=oneshot)
sudo systemctl start sentinel-pipeline.service

# Recent output via journald (short-lived on this host, see below)
journalctl -u sentinel-pipeline.service -n 100
```

### Deploying a change

Code-only changes need nothing beyond `git pull` on the Pi: the next timer
firing (or `systemctl start sentinel-pipeline.service`) runs the current
working tree, since `ExecStart` points at the venv interpreter and the
script path directly rather than a packaged build.

If you change either unit file under `/etc/systemd/system/`:
```bash
sudo systemctl daemon-reload
sudo systemctl restart sentinel-pipeline.timer
```

If `requirements.txt` changed:
```bash
cd ~/projects/sentinel/pipeline
source .venv/bin/activate
pip install -r requirements.txt
```

### Logs

`journalctl -u sentinel-pipeline.service` is not durable on this host: other
services on the Pi generate enough journal volume that entries rotate out
within hours, which is too short for a job that runs a few times a day. The
pipeline also writes its own rotating logfile at
`pipeline/logs/pipeline.log` (5MB × 7 backups, gitignored); check this
first, not journald, when looking into a past run.

Each run ends with a per-source staleness check. A `WARNING` line like:
```
staleness: FIRMS newest row is 35 days, 10:18:27 old (threshold 2 days, 0:00:00)
```
means that source's newest row in Supabase is older than expected for how
often that API updates. This is the signal to go check whether the fetcher,
its credentials, or the upstream API broke. An `INFO ... (ok)` line means the
source is within its expected freshness window; thresholds are looser for
EONET/GDACS since both are event-driven and can legitimately go quiet for
weeks.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
