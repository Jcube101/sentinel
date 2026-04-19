# Learnings

Real lessons from building the Sentinel pipeline. Recorded so the next
project starts smarter.

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
PYTHONPATH=. python -m fetchers.firms
```

This applies to any project where modules import from a sibling directory.
