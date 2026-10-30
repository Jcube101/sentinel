# Sentinel

[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Made with Claude](https://img.shields.io/badge/Made%20with-Claude-blueviolet)](https://claude.ai)

**The Situation Report: natural hazards in India, as a newspaper front page.**

**Live:** https://sentinel-frontend-8hem.onrender.com

Three times a day, Sentinel reads six public sources: NASA's fire satellites, NASA's event
tracker, the global disaster alert system GDACS, the US Geological Survey, CPCB's real-time
air quality index and OpenAQ. It turns what they report into a **severity desk**. Every hazard
becomes an item with a level from 1 (minor) to 4 (severe) on one shared scale, and a reason.
A cyclone, a state's fires and a bad air day can then be ranked against each other, instead of
by raw counts (one run can hold ~2,000 fire hotspots and a single cyclone).

Each run is an **edition**, numbered like a newspaper's. The site prints it as a front page,
with its stories ranked by level and written as news for ordinary readers.

## The site

- **Desk** (`/`): the latest edition. A headline, the stories ranked by level, Since
  yesterday, a small map, and the page's notes. On a day when nothing is above Level 1 it
  becomes a quiet desk: an all-clear line per hazard, what's worth watching, and the last
  14 days.
- **Every edition, as it was published** (`/edition/32`), and **a day's edition**
  (`/date/2026-10-30`). Each past edition shows the words, levels and map it had when it
  came out.
- **Item pages** (`/item/cyclone/GDACS-TC-1001345`): one hazard's story, its figures, its
  history across editions and, for fires, the state's daily counts against the usual.
- **Map** (`/map`): a symbol per hazard (spirals, ripples, waves, fire dots, air squares),
  sized and coloured by level, with the items list beside it.
- **Archive** (`/archive`): every day with an edition, a month at a time, and the items
  that closed.
- **Sources** (`/sources`): how each source answered in each edition, and how fresh its
  data was.
- **About** (`/about`): how levels are set, what the marks mean, and the data credits.

Sentinel is not an official emergency alert system. In an emergency, follow local
authorities (NDMA, 112).

## How levels are set

| | 1 Minor | 2 Elevated | 3 High | 4 Severe |
|---|---|---|---|---|
| Cyclone, flood (GDACS alert) | green | green, rising | orange | red |
| Earthquake (USGS; within 100 km of India, or M6+ in the region) | M4–4.9 | M5–5.9 | M6–6.9 | M7+ |
| Air (CPCB AQI, worst cities) | poor (201–300) | very poor (301–400) | severe (401+) in 1 city | severe in 3+ cities |
| Fire (per state, against its 2024–25 average for that week) | below 2× | 2× (25+ fires) | 4×, or a GDACS forest-fire alert | a large fire near a town of 100,000+ |

Fire levels from satellite counts are held at Level 2 until live counts have been checked
against the archive the averages come from; only a GDACS forest-fire alert lifts a state to
Level 3 for now. Every threshold lives in [`pipeline/severity.toml`](pipeline/severity.toml),
and each edition stores the rules it ran with, so a past edition's levels are explained by
its own rules.

## How a run works

A systemd timer on a Raspberry Pi runs the pipeline at 09:00, 15:00 and 21:00 UTC (14:30,
20:30 and 02:30 IST). One run:

1. Opens the edition: a `pipeline_runs` row, whose id is the edition number, with the
   thresholds it runs with.
2. Fetches FIRMS, EONET, GDACS, USGS and OpenAQ.
3. Writes EONET, GDACS and USGS events to `events` and OpenAQ readings to `aqi_readings`,
   then each source's freshness to `sources`. FIRMS hotspots aren't stored in Supabase; they
   go to the fire stages and a local archive.
4. Clusters the fire hotspots into fire events by district.
5. Levels fire per state against its seasonal norm.
6. Levels quakes, floods and cyclones.
7. Levels air quality, from CPCB's real-time feed on data.gov.in (OpenAQ as the fallback).
8. Builds the quiet-day desk: the watching list and a status line per hazard.
9. Archives old rows and the run's FIRMS hotspots to local SQLite, then cleans up (only if
   the archive succeeded).
10. Checks each source's freshness, alerts if one has gone stale, and closes the edition as
    ok or failed.

Each severity stage (4–8) is isolated: if one fails, the run is marked failed and alerts,
but the other stages still run. When a source doesn't answer, its items keep their last
known level and are marked as such, rather than dropped. The site, a static React app on
Render, reads the desk tables through Supabase's read-only anon key.

Design and decisions: [docs/severity-pipeline.md](docs/severity-pipeline.md) (the pipeline)
and [docs/situation-report-plan.md](docs/situation-report-plan.md) (the site). How the site
writes: [docs/style-guide.md](docs/style-guide.md).

---

## Data Sources

| Source | What Sentinel uses it for | Auth | Update frequency |
|--------|---------------------------|------|------------------|
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) | Fire hotspots (VIIRS NOAA-20), clustered into fire events; its 2024–2025 archive sets each state's seasonal norm | API key | Near real-time, two passes a day |
| [GDACS](https://www.gdacs.org/) | Flood and cyclone alerts (with each storm's advisories: wind, track, landfall); forest-fire alerts lift a state's fire level | None | Event-driven |
| [USGS Earthquake Hazards](https://earthquake.usgs.gov/fdsnws/event/1/) | Earthquakes, M4.0+ | None | Real-time |
| [CPCB real-time AQI on data.gov.in](https://data.gov.in/resource/real-time-air-quality-index-various-locations) | The air item's primary source: station AQI sub-indices (read each run, not stored) | API key | Hourly |
| [OpenAQ v3](https://api.openaq.org/) | The air item's fallback (24 h means at reference monitors) | API key | Hourly |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Wildfire and storm events, stored in `events`; not on the desk | None | Real-time |

Map data: geoBoundaries (district boundaries, ODbL 1.0), DataMeet / Election Commission of
India (state boundaries, CC BY 2.5 IN), GeoNames (populated places, CC BY 4.0) and an Esri
basemap. Details in [pipeline/data/README.md](pipeline/data/README.md) and the site's About
page.

---

## Structure

```
sentinel/
├── pipeline/              — Python pipeline (runs on the Pi)
│   ├── pipeline.py        — one run: fetch → write → severity stages → archive → cleanup
│   ├── fetchers/          — FIRMS, EONET, GDACS, USGS, OpenAQ
│   ├── runs.py            — editions and per-source freshness
│   ├── fire.py            — FIRMS hotspots clustered into fire events by district
│   ├── fire_desk.py       — one fire item per state, against the seasonal norm
│   ├── desk.py            — quake, flood and cyclone items
│   ├── air.py, datagov.py — the national air item (CPCB on data.gov.in, OpenAQ fallback)
│   ├── watch.py           — the watching list and per-category status
│   ├── severity.toml      — every severity threshold
│   ├── migrations/        — numbered SQL (001–009), applied by hand in the Supabase SQL editor
│   ├── data/              — boundaries, populated places, fire baseline, heat-source mask
│   ├── tools/             — one-off builders and the fire-threshold replay
│   ├── tests/             — offline pytest suite
│   └── archive.py, backfill.py, notify.py, notify_failure.py, config.py
├── frontend/              — the Situation Report: Vite + React + TypeScript, on Render
│   ├── src/lib/desk/      — the desk logic and copy templates, pure and tested
│   ├── src/hooks/         — every Supabase read
│   ├── src/pages/         — Desk, Item, Map, Archive, Date, Sources, About
│   └── src/components/paper/ — the newspaper parts and the map
└── docs/
    ├── severity-pipeline.md      — the pipeline's spec, decisions, status, follow-ups
    ├── situation-report-plan.md  — the site's plan, decisions and status
    ├── style-guide.md            — how every generated line is written
    └── design/                   — design mock-ups (visual and copy spec)
```

---

## Tech Stack

- **Pipeline:** Python 3.13 (3.11+) on a Raspberry Pi, supabase-py, requests, shapely
  (district and India-outline geometry), python-dotenv; a systemd timer, three runs a day
- **Database:** Supabase (Postgres + REST API); the pipeline writes with the service role,
  the site reads with the anon key
- **Site:** React 19, TypeScript, Vite 8, Tailwind CSS 3, Leaflet (react-leaflet, raster
  tiles, no WebGL), React Query, React Router 7, Vitest; a static site on Render

---

## Getting Started

### Pipeline

```bash
git clone https://github.com/Jcube101/sentinel.git
cd sentinel/pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in your keys
```

Tests (offline, no network or credentials needed):

```bash
pip install -r requirements-dev.txt
python -m pytest
```

A dry run fetches everything and logs what would happen, without writing to Supabase,
creating an edition or running cleanup:

```bash
PYTHONPATH=. python pipeline.py --dry-run
```

`PYTHONPATH=. python pipeline.py` is a real run: it creates an edition. On the Pi only the
timer does that.

A single fetcher: `PYTHONPATH=. python -m fetchers.usgs` (also `firms`, `eonet`, `gdacs`,
`openaq`).

Backfill `events` (FIRMS isn't backfilled: its hotspots no longer go to Supabase):

```bash
PYTHONPATH=. python backfill.py --source all --days 90
PYTHONPATH=. python backfill.py --source usgs --days 365
```

The database schema is the numbered SQL files in `pipeline/migrations/`, pasted into the
Supabase SQL editor in order. The pipeline needs migrations 001–009.

### Site

```bash
cd frontend
npm install
cp .env.example .env.local   # Supabase URL and anon key
npm run dev
npm test
```

More in [frontend/README.md](frontend/README.md).

---

## Data Retention

| Data | Where | Kept |
|------|-------|------|
| Editions, desk items and their per-edition snapshots, watching lists, category status, fire map points per day, fire baseline | Supabase | For good: past editions are read from them |
| Fire events (`fire_events`) | Supabase | 14 days |
| Watch subjects (`desk_watch`) | Supabase | Until not updated for 14 days |
| GDACS events | Supabase | 60 days |
| EONET and USGS events | Supabase | 365 days |
| OpenAQ readings (`aqi_readings`) | Supabase | 7 days |
| FIRMS hotspots | Local SQLite archive on the Pi | For good (they never go to Supabase) |

`archive.py` copies `events` older than 30 days and `aqi_readings` older than 7 days to
`sentinel_archive.db` on the Pi, and each run's FIRMS hotspots go there directly. Cleanup
runs only after a successful archive. If archiving fails, that run skips cleanup rather than
delete un-archived data, and exits non-zero.

---

## Environment Variables

Pipeline (`pipeline/.env`, see `pipeline/.env.example`):

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `FIRMS_MAP_KEY` | Yes | NASA FIRMS MAP key |
| `OPENAQ_API_KEY` | Yes | OpenAQ API key |
| `DATA_GOV_IN_API_KEY` | No | data.gov.in key for CPCB's real-time AQI; without it the air item uses OpenAQ |
| `NOTIFY_WEBHOOK_URL` | No | Webhook that receives failure and staleness alerts (see Alerting) |

Site (`frontend/.env.local`, see `frontend/.env.example`): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, and optionally `VITE_DEV_PAGES=1` to include the `/dev/symbols`
page in a build.

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

# Trigger a run right now (blocks until it finishes, Type=oneshot). This creates an edition.
sudo systemctl start sentinel-pipeline.service

# Recent output via journald (short-lived on this host, see below)
journalctl -u sentinel-pipeline.service -n 100
```

### Deploying a change

There is no build or deploy step for the pipeline: the next timer firing runs the main
checkout's current working tree, since `ExecStart` points at the venv interpreter and the
script path directly. So the main checkout stays on `main`, and every change is built and
tested in its own git worktree, then fast-forward merged into `main` once tested. Schema
changes are SQL files in `pipeline/migrations/`, pasted into the Supabase SQL editor before
the code that needs them is merged. The working rules are in [CLAUDE.md](CLAUDE.md).

The site deploys itself: Render builds `main` (`npm install && npm run build` in
`frontend/`) about a minute after a push.

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
means that source's newest data is older than expected for how often that API updates, and
also fires an alert (see Alerting below). This applies to FIRMS (its newest observation, as
recorded on its `sources` row), USGS (its newest row in `events`) and OpenAQ (its newest
`aqi_readings` row). EONET and GDACS log their row age at `INFO` and never alert on it,
because both are event-driven and a real quiet month looks identical to a broken fetcher
from row age alone; see LEARNINGS.md for the reasoning and the real gaps that set these
thresholds.

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

See [ROADMAP.md](ROADMAP.md). Lessons learned along the way: [LEARNINGS.md](LEARNINGS.md).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](LICENSE).
