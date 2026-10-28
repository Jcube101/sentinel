# Sentinel

[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Made with Claude](https://img.shields.io/badge/Made%20with-Claude-blueviolet)](https://claude.ai)

**Natural hazard tracker for India, with a severity desk.**

Sentinel pulls fire hotspots, earthquakes, floods, cyclones and air quality from six public sources three times a day and writes them to Supabase. On top of the raw data it keeps a **severity desk**: every item gets a level from 1 (minor) to 4 (severe) on one shared scale, with a plain-language reason such as "GDACS Red alert" or "Very poor in Panipat". A cyclone, a state's fire activity and a bad air day can then be ranked against each other, instead of by raw counts (one run can hold ~2,500 fire hotspots and a single cyclone).

Each run is an **edition**, numbered and recorded with every source's status and freshness. Per edition the pipeline produces:

- **Desk items:** quakes near India (or M6+ in the region), GDACS flood and cyclone alerts, fire activity per state measured against its seasonal norm (from the 2024–2025 NASA FIRMS archive; capped at Level 2 until live counts are calibrated against the archive), and one national air-quality item from CPCB's real-time AQI. Items open, escalate and close by rule. When a source fails, its items are kept and marked "last-known" rather than dropped.
- **History:** a snapshot of every item in every edition, for trends, "since yesterday" changes and a 14-day strip of the most severe level per day.
- **Quiet-day status:** a watching list (anything close to its next level) and a one-line status per category, so a quiet day reads as an all-clear rather than an empty page.

The live site shows the event map and an air-quality panel. The desk view is the next frontend phase and is not live yet. Design, decisions and status: [docs/severity-pipeline.md](docs/severity-pipeline.md).

## Live Demo
https://sentinel-frontend-8hem.onrender.com

---

## Structure

```
sentinel/
├── pipeline/    — Python data pipeline (runs on the Pi)
│   ├── fetchers/          — FIRMS, EONET, GDACS, USGS, OpenAQ
│   ├── pipeline.py        — orchestrator: fetch → write → severity stages → archive → cleanup
│   ├── runs.py            — editions and per-source freshness
│   ├── fire.py            — FIRMS hotspots clustered into fire events by district
│   ├── baseline.py        — seasonal fire norm per state and week
│   ├── fire_desk.py       — one fire item per state
│   ├── desk.py            — quake, flood and cyclone items
│   ├── air.py, datagov.py — national air item (CPCB feed on data.gov.in, OpenAQ fallback)
│   ├── watch.py           — watching list and per-category status
│   ├── severity.toml      — every severity threshold
│   ├── migrations/        — SQL, applied by hand in the Supabase SQL editor
│   ├── data/              — boundaries, populated places, fire baseline, heat-source mask
│   ├── tools/             — one-off builders and the fire-threshold replay
│   ├── tests/             — offline pytest suite
│   ├── backfill.py, archive.py, notify.py, notify_failure.py, config.py
│   ├── requirements.txt, requirements-dev.txt
│   └── render.yaml        (legacy Render cron config, unused; pipeline runs on the Pi)
├── frontend/    — Vite + React map interface (live at sentinel-frontend-8hem.onrender.com)
│   ├── src/
│   │   ├── lib/          — Supabase client, types, time/severity helpers
│   │   ├── hooks/        — React Query data hooks
│   │   ├── pages/        — Landing (Home), LiveMap, Insights, EventDetail, About
│   │   └── components/   — map, layout, ui
│   ├── package.json
│   └── render.yaml
└── docs/
    ├── severity-pipeline.md — severity desk spec, decisions, status, follow-ups
    └── design/              — mock-ups for the desk frontend
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Raspberry Pi systemd timer: 09:00 / 15:00 / 21:00 UTC       │
│                             = 14:30 / 20:30 / 02:30 IST      │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
                       ┌───────────────┐
                       │  pipeline.py  │ ──► pipeline_runs (edition), sources (freshness)
                       └───────┬───────┘
        ┌───────────┬──────────┼───────────┬───────────┐
        ▼           ▼          ▼           ▼           ▼
   NASA FIRMS   NASA EONET   GDACS       USGS       OpenAQ
        └───────────┴────┬─────┴───────────┘           │
                         ▼                             ▼
                 ┌──────────────┐             ┌──────────────────┐
                 │    events    │             │   aqi_readings   │
                 └──────┬───────┘             └────────┬─────────┘
                        └──────────────┬───────────────┘
                                       ▼
                     Live site: map + AQI panel (Render static)

  Severity stages, on the same fetch results (+ CPCB AQI from data.gov.in):
     fire.py → fire_desk.py → desk.py → air.py → watch.py
                                       │
                                       ▼
     fire_events · desk_items · desk_item_snapshots · desk_watch · category_status
                                       ▼
                         Desk frontend (next phase, not live)

  Then: archive.py (old rows → local SQLite) → cleanup → staleness check
```

---

## Data Sources

| Source | What it provides | Auth | Update frequency |
|--------|-----------------|------|-----------------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Fire hotspots (VIIRS NOAA-20), clustered into fire events; the 2024–2025 archive sets the seasonal norm | API key | Near real-time |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Wildfires, severe storms | None | Real-time |
| [GDACS](https://www.gdacs.org/) | Floods, cyclones, earthquakes; wildfire alerts (used only to lift a state's fire item) | None | Event-driven |
| [USGS Earthquake Hazards](https://earthquake.usgs.gov/fdsnws/event/1/) | Earthquakes (M4.0+) | None | Real-time |
| [OpenAQ v3](https://api.openaq.org/) | PM2.5, PM10, NO2, SO2, O3 for the map; fallback for the air item | API key | Hourly |
| [CPCB real-time AQI on data.gov.in](https://data.gov.in/resource/real-time-air-quality-index-various-locations) | Station AQI sub-indices; the air item's primary source (read each run, not stored) | API key | Hourly |

---

## Tech Stack

- **Python 3.13** on the Pi (3.11 or later)
- **supabase-py** — database client
- **requests** — HTTP
- **python-dotenv** — environment variables
- **shapely** — district and India-outline geometry for the severity desk
- **Supabase** — Postgres database + REST API
- **Raspberry Pi (jobpi)**: pipeline runs via a systemd timer pair, three times daily
- **Render** — frontend static site host
- **Vite + React 19 + TypeScript** — frontend
- **Tailwind CSS + Leaflet + Recharts** — styling, map, charts
- **React Query + Supabase client** — frontend data layer
- **React Router** — Home / Live Map / Insights / Event detail / About

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
to Supabase or running cleanup (no edition is recorded):

```bash
python pipeline.py --dry-run
```

### 4. Run the tests

Offline, with no network or credentials needed:

```bash
pip install -r requirements-dev.txt
python -m pytest
```

### 5. Run a single fetcher

```bash
python -m fetchers.firms
python -m fetchers.eonet
python -m fetchers.gdacs
python -m fetchers.usgs
python -m fetchers.openaq
```

### 6. Backfill historical data

```bash
python backfill.py --source all --days 90
python backfill.py --source firms --days 30
python backfill.py --source usgs --days 365
```

### 7. Archive old data to local SQLite

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

Windows Task Scheduler archival is fully retired: `setup_task_scheduler.ps1`
has been removed from the repo and the Windows scheduled task itself has
been disabled. Archival runs only on the Pi, inside `pipeline.py`, before
every cleanup; it has no Windows or Render component.

---

## Data Retention

`pipeline.py` runs `archive.py` and then cleanup at the end of every execution:

| Data | Retention in Supabase |
|------|-----------|
| FIRMS / GDACS events | 60 days |
| EONET / USGS events | 365 days |
| AQI readings | 7 days |
| Fire events (`fire_events`) | 14 days |

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
| `DATA_GOV_IN_API_KEY` | No | data.gov.in key for CPCB's real-time AQI; without it the air item uses OpenAQ |
| `NOTIFY_WEBHOOK_URL` | No | Webhook that receives failure/staleness alerts; see Alerting below |

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

1. **Edition**: each run opens a `pipeline_runs` row; its id is the edition number
2. **Fetch**: each fetcher calls its API and returns `List[dict]` matching the Supabase schema exactly. A failed request or a malformed response propagates and fails that source; an empty result from a healthy API does not. Every fetcher retries timeouts and connection errors (3 tries). A GDACS timeout never fails the run; a FIRMS timeout fails it only if FIRMS also timed out in the previous run
3. **Transform** — event severity labels, categories, and deterministic IDs computed during fetch
4. **Upsert** — `pipeline.py` bulk-upserts to Supabase in batches of 500 using deterministic `id` as conflict key, then records each source's freshness on `sources`
5. **Severity stages**: fire events, fire desk, desk (quakes, floods, cyclones), air and the quiet-day desk, with every threshold in `pipeline/severity.toml`. Each stage is isolated: one that fails marks the run failed, but the others still run
6. **Archive**: `archive.py` copies old data to local SQLite before cleanup can age it out of Supabase; if archiving fails, cleanup is skipped for that run
7. **Cleanup**: deletes stale rows at the end of every run, gated on a successful archive
8. **Staleness check**: logs the newest row's age per source, and alerts (see Alerting below) if a source expected to be fresh has gone quiet. FIRMS/USGS/OpenAQ are checked this way; EONET/GDACS are event-driven and are only alerted on if the fetch itself fails, not on row age, since a real quiet month and a broken fetcher look identical from row age alone
9. **Alert on failure**: if the run fails outright, a separate systemd unit fires via `OnFailure=` and sends the same kind of alert, so a crash the process can't self-report still reaches you
10. **Schedule**: a systemd timer on the Raspberry Pi (jobpi) runs `pipeline.py` three times daily, at 09:00, 15:00 and 21:00 UTC (14:30, 20:30 and 02:30 IST)

---

## Pi Deployment & Operations

The pipeline runs on a Raspberry Pi (`jobpi`) as a systemd timer + oneshot
service pair. This section is the operational reference for that setup.
`/path/to/sentinel` and `<user>` below stand for the checkout's location and
the account that runs it.

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
OnFailure=sentinel-pipeline-alert.service

[Service]
Type=oneshot
ExecStart=/path/to/sentinel/pipeline/.venv/bin/python pipeline.py
WorkingDirectory=/path/to/sentinel/pipeline
User=<user>
Environment=PYTHONUNBUFFERED=1
StandardOutput=journal
StandardError=journal
```

`/etc/systemd/system/sentinel-pipeline-alert.service` (triggered by the
`OnFailure=` above, see Alerting below):
```ini
[Unit]
Description=Send a failure alert for sentinel-pipeline.service

[Service]
Type=oneshot
ExecStart=/path/to/sentinel/pipeline/.venv/bin/python notify_failure.py
WorkingDirectory=/path/to/sentinel/pipeline
User=<user>
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

There is no build or deploy step: the next timer firing (or `systemctl
start sentinel-pipeline.service`) runs the main checkout's current working
tree, since `ExecStart` points at the venv interpreter and the script path
directly rather than a packaged build. So the main checkout stays on `main`.
Changes are built and tested in a separate git worktree and fast-forward
merged into `main` only once tested (pipeline/CLAUDE.md, *Working on the
pipeline*). Schema changes are SQL files in `pipeline/migrations/`, pasted
into the Supabase SQL editor before the code that needs them is merged.

If you change either unit file under `/etc/systemd/system/`:
```bash
sudo systemctl daemon-reload
sudo systemctl restart sentinel-pipeline.timer
```

If `requirements.txt` changed (from the main checkout):
```bash
cd pipeline
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
often that API updates, and also fires an alert (see Alerting below). This
only applies to FIRMS, USGS, and OpenAQ: `EONET`/`GDACS` log their row age at
`INFO` regardless of how old it is and never alert on it, because both are
event-driven and a real quiet month looks identical to a broken fetcher from
row age alone; see LEARNINGS.md for the reasoning and the real historical
gaps that set these thresholds.

---

## Alerting

A failed run or a stale dense source (FIRMS, USGS, OpenAQ) sends an alert
through `notify.py`: a POST of `{source, subject, body}` JSON to
`NOTIFY_WEBHOOK_URL`. If `NOTIFY_WEBHOOK_URL` isn't set, the attempt is
logged and skipped rather than raising, so a missing alert channel can't
break the run it's trying to report on.

**Live delivery:** `NOTIFY_WEBHOOK_URL` is currently set to a webhook
trigger on an n8n workflow named "Sentinel Alerts", which forwards the
POST to a Gmail send node and emails Job. Sentinel itself holds no mail
credentials; n8n owns delivery entirely. The webhook is currently
unauthenticated (no header/token check), which is acceptable for a
low-value, append-only alert sink, but is worth adding if it's ever abused
(spam, unrelated traffic hitting the endpoint). The literal URL is
intentionally not written in any tracked file; read it from `.env` at
runtime, never paste it into a commit, an issue, or chat.

Two paths call it:
- **In-process**, from `_check_staleness()` inside `pipeline.py`, when a
  dense source crosses its threshold or any source has zero rows on record.
- **Out-of-process**, via `sentinel-pipeline.service`'s `OnFailure=` hook,
  which runs `notify_failure.py` as a separate unit
  (`sentinel-pipeline-alert.service`). This exists specifically to catch
  failures the pipeline process can't self-report: an interpreter crash, an
  OOM kill, anything that ends the process before its own code runs. It
  gathers `systemctl show` output and the tail of `pipeline/logs/pipeline.log`
  and sends one alert with no secrets in it.

### Testing the live chain (on the Pi, real email)

Reads `NOTIFY_WEBHOOK_URL` from `.env`, never prints it (from the checkout):
```bash
cd pipeline
PYTHONPATH=. .venv/bin/python -c "
from notify import send_alert
ok = send_alert('Manual test', 'Testing the n8n to Gmail alert chain from the Pi.')
print('sent' if ok else 'NOTIFY_WEBHOOK_URL not set or the POST failed, check logs')
"
```
Confirm an email lands in Job's inbox. To test the `OnFailure=` path
specifically (still real, still emails):
```bash
cd pipeline
PYTHONPATH=. .venv/bin/python notify_failure.py
```

### Testing without touching the real webhook

Point `NOTIFY_WEBHOOK_URL` at a local listener instead, so nothing reaches
n8n or Gmail:
```bash
# terminal 1: minimal receiver
python3 -c "
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        print(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200); self.end_headers()
http.server.HTTPServer(('127.0.0.1', 8199), H).serve_forever()
"

# terminal 2: force a staleness alert without touching real data
NOTIFY_WEBHOOK_URL=http://127.0.0.1:8199/ PYTHONPATH=. python3 -c "
import pipeline
from datetime import timedelta
pipeline.DENSE_STALENESS_THRESHOLDS['FIRMS'] = timedelta(seconds=1)
pipeline.run(dry_run=True)
"

# or the OnFailure path directly
NOTIFY_WEBHOOK_URL=http://127.0.0.1:8199/ PYTHONPATH=. python3 notify_failure.py
```

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
