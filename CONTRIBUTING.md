# Contributing

Sentinel is a learning project and contributions are welcome.

---

## Local Setup

```bash
git clone https://github.com/Jcube101/sentinel.git
cd sentinel/pipeline
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in your API keys in .env
pip install -r requirements-dev.txt   # pytest, for the offline tests
```

Run the tests (no network or credentials needed):
```bash
python -m pytest
```

Run it without writing to Supabase, creating an edition or running cleanup, to
check what a change would do:
```bash
PYTHONPATH=. python pipeline.py --dry-run
```

A real run (`PYTHONPATH=. python pipeline.py`) writes to Supabase and creates an
edition (a `pipeline_runs` row). Against your own Supabase project that's fine; in
this repo's deployment only the Pi's timer makes editions, and tests and dry runs
never do.

Run a single fetcher to test it in isolation:
```bash
PYTHONPATH=. python -m fetchers.firms
```

### Frontend

```bash
cd sentinel/frontend
npm install
cp .env.example .env.local
# fill in the Supabase URL and anon key in .env.local
npm run dev
npm test
```

The site reads only the desk tables, through the anon key. Every line it writes follows
[docs/style-guide.md](docs/style-guide.md); the tests hold real editions' copy to the
letter, so change the guide and the tests together. More in
[frontend/README.md](frontend/README.md).

---

## How to Add a New Fetcher

Create `pipeline/fetchers/your_source.py`. The interface contract is simple:

1. **Export `fetch() -> List[dict]`** — this is the only function `pipeline.py` calls
2. **Return dicts matching the events table schema exactly** (see pipeline/CLAUDE.md for all fields)
3. **Handle per-row errors internally, but let request/parse failures propagate**: wrap per-row/per-feature transform logic in its own try/except, log a warning, and skip that row. Do *not* catch the top-level request (`requests.RequestException`) or response-parse failure; let it raise. `pipeline.py`'s `_run_fetcher()` catches it there and marks that source failed for the run. A source that legitimately has zero events today must still return `[]` successfully; a broken endpoint, revoked key, or malformed response must fail loudly instead of silently returning `[]` (this was a real bug, see LEARNINGS.md).
4. **Use deterministic IDs** — build the `id` field from source data fields, never `uuid4()`
5. **Never write to Supabase** — fetchers only fetch and transform; `pipeline.py` handles all writes
6. **Log clearly**: use `logger.info` for counts, `logger.warning` for skipped rows, `logger.error` before letting a request/parse failure propagate

Then:
- In `pipeline/pipeline.py`, import your fetcher and add it to `FETCHERS`. If it returns events, add its name to `EVENT_SOURCES` so its rows go into the `events` upsert
- Add a line to the summary print block
- In `pipeline/runs.py`, add it to `SOURCE_IDS`. Each run records freshness by updating the source's row in the `sources` table, so add that row with a migration (like `pipeline/migrations/006_datagov_source.sql`)
- Make requests through `fetchers.http.get_with_retry` (3 tries on timeouts and connection errors)
- Add offline tests under `pipeline/tests/` (fakes, no network)

If your fetcher writes to a different table (like `openaq.py` writes to `aqi_readings`), add a separate `_upsert()` call with the appropriate conflict key.

## Schema Changes

Add a numbered SQL file to `pipeline/migrations/`: idempotent, with the grant pattern in `pipeline/CLAUDE.md` (anon and authenticated read only, the service role writes). The maintainer pastes it into the Supabase SQL editor; code that needs it is merged after it has been applied. Severity thresholds go in `pipeline/severity.toml`, never in code.

---

## Code Style

- Keep it simple — no unnecessary abstractions
- No comments explaining what the code does; only add a comment when the *why* is non-obvious
- One helper function per logical concern (parsing, severity mapping, etc.)
- All credentials come from `config.py`, never hardcoded
- Use `logging`, not `print`, inside library code; `print` is fine in `__main__` blocks

---

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Test pipeline changes: `cd pipeline && python -m pytest`, then `PYTHONPATH=. python pipeline.py --dry-run`
4. Test frontend changes: `cd frontend && npm test && npm run lint && npm run build` (all must pass)
5. Check that no secrets (`.env`, `.env.local`, keys), local paths or FIRMS archive files are in the diff
6. Open a PR with a clear description of what you changed and why

---

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- The full error output
- Which fetcher or part of the pipeline was affected

---

## Note

This is a personal learning project. The codebase is intentionally kept
simple and pragmatic. Contributions that add complexity without clear benefit
may not be merged, but fixes, new data sources, and frontend improvements are
all welcome.
