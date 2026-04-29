# Contributing

Sentinel is a learning project and contributions are welcome.

---

## Local Setup

```bash
git clone https://github.com/Jcube101/sentinel.git
cd sentinel/pipeline
python -m venv venv
source venv/Scripts/activate  # Windows Git Bash
pip install -r requirements.txt
cp .env.example .env
# fill in your API keys in .env
```

Run the full pipeline:
```bash
PYTHONPATH=. python pipeline.py
```

Run a single fetcher to test it in isolation:
```bash
PYTHONPATH=. python -m fetchers.firms
```

### Frontend

```bash
cd sentinel/frontend
npm install
cp .env.example .env.local
# fill in Supabase anon key in .env.local
npm run dev
```

---

## How to Add a New Fetcher

Create `pipeline/fetchers/your_source.py`. The interface contract is simple:

1. **Export `fetch() -> List[dict]`** — this is the only function `pipeline.py` calls
2. **Return dicts matching the events table schema exactly** (see SPEC.md or pipeline/CLAUDE.md for all fields)
3. **Handle all exceptions internally** — catch errors per-row and per-request, log warnings, never raise to the caller
4. **Use deterministic IDs** — build the `id` field from source data fields, never `uuid4()`
5. **Never write to Supabase** — fetchers only fetch and transform; `pipeline.py` handles all writes
6. **Log clearly** — use `logger.info` for counts, `logger.warning` for skipped rows, `logger.error` for failed requests

Then in `pipeline/pipeline.py`:
- Import your fetcher
- Add a `_run_fetcher("YourSource", your_source)` call
- Add the results to `all_events` (or handle a new table separately)
- Add a line to the summary print block

If your fetcher writes to a different table (like `openaq.py` writes to `aqi_readings`), add a separate `_upsert()` call with the appropriate conflict key.

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
3. Test by running `cd pipeline && PYTHONPATH=. python pipeline.py` end-to-end
4. Open a PR with a clear description of what you changed and why

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
