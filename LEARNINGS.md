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

---

## A Fetcher That Swallows Every Exception Can Never Fail

Every fetcher caught `requests.RequestException` (and JSON/CSV parse
failures) at the top level and returned `[]` on error, matching an earlier
version of the "handle all exceptions internally" rule in CONTRIBUTING.md.
`pipeline.py`'s `_run_fetcher()` already had a `try/except` around
`module.fetch()` specifically to catch this and mark the source failed,
but since fetchers never raised, that code path was dead. A revoked API
key, a moved endpoint, or a 500 all produced `(rows=[], success=True)`, and
the pipeline exited `0` every time. FIRMS ran this way silently for 35 days
before anyone noticed the map had stopped showing new fires.

The fix: fetchers now only catch **per-row/per-feature** errors internally
(one malformed CSV row or GeoJSON feature shouldn't sink the whole batch).
Top-level request and parse failures propagate out of `fetch()` and hit
`_run_fetcher()`'s existing catch, which was always the intended failure
path. The distinction that matters: a healthy API legitimately returning
zero rows today must still report success; a broken one must not.

---

## FIRMS's `day_range` Must Cover the Overpass Window, Not Just "Today"

The FIRMS area-CSV endpoint's trailing path segment (`.../{bbox}/{day_range}`)
counts back from the **current UTC calendar day**, not a rolling 24 hours.
With `day_range=1`, a pipeline run at 01:00 UTC queries "today", but VIIRS
NOAA-20 doesn't overpass India until roughly 06:00-08:00 UTC, so "today" is
still empty at query time. Every run returned rows from whatever sliver of
the current UTC day happened to already have data, which was usually
nothing.

This didn't surface under the old Render cron (`*/30 * * * *`) because
running every 30 minutes meant *some* invocation each day landed after the
overpass. Collapsing to a single daily run at a fixed early hour removed
that safety margin entirely. Fixed by widening to `day_range=2` (today and
yesterday) so the window is robust to exactly when in the day the pipeline
runs; upserts dedupe by deterministic `id`, so the overlap costs nothing.
The real fix is scheduling the run after 08:00 UTC in the first place; the
wider window is a hedge, not a substitute for that.

---

## journald Is Not a Durable Log on a Shared Host

`journalctl -u sentinel-pipeline.service` returned zero entries during an
audit of a job that had been running daily for weeks. `Storage=persistent`
was set correctly; the problem was eviction, not configuration. Two
unrelated services on the same Pi (an app stuck in an OOM-driven restart
loop) were generating enough journal volume that the ring buffer rotated
every ~11 minutes, giving the whole host roughly 6.5 hours of retained
history. A job that runs a few times a day has its logs gone long before
anyone goes looking.

journald's retention is host-wide, not per-unit: a noisy neighbor can
silently zero out another service's observability with no error or warning
on either side. Don't rely on it alone for anything that doesn't run at
least as often as the noisiest thing sharing the box. Fixed by adding a
rotating file handler (`pipeline/logs/pipeline.log`) inside the project
itself, so Sentinel's logs survive regardless of what else is running on
the Pi.

---

## Archival Must Be Wired Into the Run That Deletes, Not Scheduled Separately

`archive.py` existed, was documented, and worked correctly in isolation,
but nothing on the Pi ever called it. It had been a Windows Task Scheduler
job in an earlier deployment, and that automation didn't carry over when
the pipeline moved. Meanwhile `_cleanup()` inside `pipeline.py` kept
deleting rows past their retention window on every run, so old data was
being permanently destroyed with zero archive of it, silently, for as long
as the pipeline had been running on the Pi.

Two separately-scheduled jobs (one to archive, one to delete) can drift out
of order or one can simply stop firing without the other noticing, exactly
what happened here. The more robust pattern is to call the archive step
directly from inside the job that deletes, immediately before it, and gate
the delete on the archive having actually succeeded. Since `archive.py`
only reads from Supabase and writes locally via `INSERT OR REPLACE`, it's
idempotent and safe to call on every invocation, including multiple times a
day.

---

## Detection Without Notification Is Still a Silent Failure

Fixing the fetchers to fail loudly (see above) made a broken run turn the
systemd unit red and log a `WARNING` for a stale source. Nothing about that
reaches a person. A red unit nobody looks at and a green one that lies are
the same outcome from the outside: the problem sits there until someone
happens to go looking. The FIRMS outage this project was built around
existed for 35 days specifically because detection and notification were
never the same thing.

The fix isn't just "add alerting", it's routing every failure signal that
already exists through it: fetch failures (already fail the run) get an
`OnFailure=` systemd hook so even a crash the process can't self-report
still reaches someone, and staleness (already logged) gets the same
`notify.send_alert()` call the moment it's detected, not left as a log line
for the next audit to find. A monitoring signal that only a human actively
reading logs will ever see isn't monitoring, it's an audit trail.

The corollary: a flat "no new rows in N days" tripwire is wrong for a
source whose true event rate is irregular. EONET and GDACS are event-driven
and can go quiet for weeks legitimately, so treating their row age the same
way as FIRMS's would either miss real breakage (threshold too loose to ever
fire) or alert constantly on healthy quiet periods (too tight). A live
probe distinguishing "the fetch returned 200 and parsed cleanly, it just
found nothing new" from "the fetch failed" was the only way to tell the two
apart, and only the second one is a real tripwire for a sparse source.

---

## A Deployed Frontend's Anon Key Is Public by Design, Use It to Test RLS

Diagnosing why AQI data collected into Supabase never appeared in the
frontend needed a real anon-role request against both tables, but there was
no `frontend/.env.local` on the Pi (the frontend runs on Render, not here),
no direct Postgres connection, and no Supabase CLI to introspect RLS
policies. The service-role key bypasses RLS entirely, so it couldn't be
used to test what the anon role actually sees.

The anon key isn't a secret: it's meant to be embedded in client-side code
and is protected only by RLS policies on the tables it can reach, so it's
already sitting in the deployed frontend's JS bundle. `curl`ing the live
site's HTML, extracting the built JS asset path, and grepping that file for
a JWT-shaped string (`eyJ...`) recovered the real production anon key
directly, no credentials needed beyond the site already being public. That
key then made real REST calls against `events` and `aqi_readings` exactly
as the browser would, which is what proved RLS wasn't the problem (both
returned 200 with real rows) rather than assuming it based on the schema
alone.

---

## Route Alerts Through a Webhook, Not a Mail Library

Once the fetchers were fixed to fail loudly and staleness was calibrated
correctly (see the entries above), the remaining gap was that a `WARNING`
log line and a red systemd unit still only reach someone actively reading
logs, which is detection, not notification. The two look identical from
outside the process until a human happens to go looking, and the whole
point of the FIRMS outage this project was built around is that nobody was
looking for 35 days.

The choice that mattered wasn't "add alerting", it was how: `notify.py`
POSTs a generic `{source, subject, body}` JSON payload to
`NOTIFY_WEBHOOK_URL` rather than calling an SMTP library or a Gmail API
client directly from the pipeline. Delivery, the mail credential, and any
future routing logic (multiple recipients, a different channel on
weekends, whatever) live entirely in an n8n workflow on the other end of
that webhook, not in Sentinel. The pipeline never holds a mail credential,
never depends on n8n's specific auth flow, and could be repointed at
Slack, a different inbox, or a pager service by changing one env var and
zero code. The cost is one more hop and one more thing (n8n, the workflow
itself) that has to stay up for alerts to land, which is a reasonable
trade for keeping credentials and delivery logic out of a data pipeline
that has no other reason to know about either.
