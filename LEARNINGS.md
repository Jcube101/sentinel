# Learnings

Real lessons from building Sentinel. Recorded so the next project starts smarter.

These are primarily from building the data pipeline (`pipeline/`).

---

## Why We Moved from n8n to Python

The original plan was to build the pipeline in n8n using Code nodes. This
failed for a fundamental reason: **n8n's Code node sandbox blocks all
external network access**. `$http`, `fetch`, `axios`, and `require` for
external modules are all unavailable inside a Code node. n8n is designed
for orchestrating pre-built nodes, not for writing custom HTTP clients.

**n8n is good for:** connecting existing integrations (Slack, Google
Sheets, webhooks), simple conditional logic, no-code orchestration.

**n8n is not suitable for:** bulk data fetching, custom API clients,
CSV parsing, or any pipeline that needs external libraries.

Python with `requests` took 30 minutes to do what n8n couldn't do at all.

---

## FIRMS Only Has a CSV Endpoint for Area Queries

The NASA FIRMS API for area queries (`/api/area/`) only returns CSV — there
is no JSON endpoint for this call. You have to use `csv.DictReader` on the
response text. The `/api/area/json/` path does not exist for this query type.

---

## OpenAQ v3 Sensor Endpoint Has Aggressive Rate Limiting

The `/v3/locations/{id}/sensors` endpoint rate-limits at roughly 2 requests
per second. With 100 locations, ~20% of requests returned 429 errors without
any throttling. Fix: `time.sleep(0.5)` between each sensor request, and cap
locations at 50 per run. This keeps the OpenAQ portion of the pipeline under
30 seconds and keeps error rate near zero.

---

## OpenAQ v3 Uses Numeric Country IDs, Not ISO Codes

The locations endpoint parameter is `countries_id` (plural, numeric), not
`country_id` (singular, ISO string). Passing `country_id=IN` silently returns
global results — in testing it returned Ghana stations. India's numeric ID is
`9`, discovered via the `/v3/countries` endpoint. Always verify filter
parameters against the actual response coordinates.

---

## Supabase Newer Projects Use Short Keys, Not JWTs

Older Supabase projects use long JWT service keys (~220 chars starting with
`eyJ`). Newer projects may use shorter keys (~46 chars). The supabase-py
library v2.15.0 validates keys against a JWT regex and raises `Invalid API key`
if the format doesn't match — even if the key is otherwise correct. Strip
whitespace from credentials in `config.py` with `.strip()` as the first line
of defence against copy-paste issues.

---

## GDACS Country Filter Is Not Strict

The GDACS API `country=IND` filter is advisory — it returns events in the
general region, not exclusively within India's borders. Events from Indonesia,
the Mid-Indian Ridge, and surrounding ocean areas are included. Always apply
a post-fetch bounding box filter (`INDIA_BBOX`) after fetching from GDACS.

---

## Deterministic IDs Are Critical for Upsert Correctness

Using `uuid4()` for event IDs would create a new row on every pipeline run
instead of updating the existing one. IDs must be built from source data
fields that uniquely identify each event (e.g. `FIRMS-{lat}-{lon}-{date}-{time}`).
This is the single most important design decision for an upsert-based pipeline.

---

## Use `python -m fetchers.firms`, Not `python fetchers/firms.py`

Running a fetcher directly as a script (`python fetchers/firms.py`) causes
an `ImportError` because `from config import ...` is a relative import from
the project root. Use module syntax with `PYTHONPATH` set instead:

```bash
cd pipeline
PYTHONPATH=. python -m fetchers.firms
```

This applies to any project where modules import from a sibling directory.

---

## FIRMS API Has a Maximum of 5 Days Per Chunk

The FIRMS `/api/area/csv/{key}/{product}/{bbox}/{day_range}/{date}` endpoint
caps `day_range` at 5 days for both NRT and SP products. Requests with
`day_range > 5` return a 400 error. Always chunk backfill windows to 5 days
maximum.

---

## FIRMS Has Two Products: NRT and SP

The FIRMS VIIRS NOAA-20 data is available in two products:
- **NRT (Near Real-Time):** covers only the last ~10 days
- **SP (Standard Processing):** covers months of history, but has a ~2-month
  processing lag — data from roughly 2 months ago to today is in a gap where
  NRT has expired and SP hasn't been processed yet

During backfill, use `VIIRS_NOAA20_NRT` for chunks where
`chunk_start.date() >= (utcnow - 10 days).date()`, and `VIIRS_NOAA20_SP`
for older chunks. Chunks falling in the SP processing gap (roughly the last
2 months) will return 0 rows — this is expected and not a bug.

---

## Postgres Rejects Duplicate IDs Within a Single Upsert Payload

If you pass two rows with the same `id` value in a single `INSERT ... ON CONFLICT`
statement, Postgres raises:

```
ON CONFLICT DO UPDATE command cannot affect row a second time
```

This means deduplication must happen **before** sending rows to Supabase, not
only on conflict with existing data. The fix is a `_dedup()` helper that keeps
the last occurrence of any duplicate `id` within the batch. Apply it in both
`pipeline.py` (on the combined events list) and inside `backfill.py`'s `_upsert()`.

---

## Supabase URL Env Vars Must Be Trimmed

`VITE_SUPABASE_URL` set on Render had a trailing space, causing `%20` to
appear in all API request URLs, resulting in `ERR_NAME_NOT_RESOLVED`.

Fix: always trim Supabase URL and key values when setting them in any
environment — Render, `.env`, or any other config. A space is invisible but
breaks everything silently.

Same issue occurred earlier in `pipeline/.env` (space in `SUPABASE_URL`
caught during pipeline setup).

---

## Migrating a Cron Job to the Pi Means a systemd Timer, Not a Daemon

When moving the pipeline off Render cron onto the Raspberry Pi, the instinct
is to write a long-running script with a `sleep` loop or a `Type=simple`
service. For a job that runs once and exits, the right pattern is a **timer
+ `Type=oneshot` service pair**: the `.timer` owns the schedule
(`OnCalendar`), the `.service` owns the command.

Two things that aren't obvious until you hit them:
- `Type=oneshot` makes `systemctl start sentinel-pipeline.service` **block
  until the run finishes** (~60s here) instead of returning immediately.
  That's correct behaviour for a batch job, not a hang.
- Point `ExecStart` straight at the venv's interpreter
  (`/home/jcube/projects/sentinel/pipeline/.venv/bin/python pipeline.py`)
  with `WorkingDirectory` set. There's no need to "activate" the venv —
  the absolute path to its Python binary is all systemd needs.

Add `Persistent=true` to the timer so a run missed while the Pi was powered
off fires on the next boot, instead of being silently skipped.

---

## A UTC `OnCalendar` Shows Up in Local Time in `systemctl list-timers`

The timer is pinned with `OnCalendar=*-*-* 01:00:00 UTC` to match the old
Render cron. But `systemctl status` and `systemctl list-timers` print the
next trigger in the **system's local timezone** — IST on the Pi — so the
schedule reads `06:30:00 IST` even though the unit file says `01:00:00 UTC`.

This looks wrong at a glance but is correct: 01:00 UTC *is* 06:30 IST. Don't
"fix" the unit file to say `06:30` — pin the schedule in UTC and let systemd
handle the display conversion. If in doubt, check `date -u` against the
listed trigger time.
