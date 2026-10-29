# Sentinel Monorepo

Sentinel tracks natural hazards in India. A Python pipeline on a Raspberry Pi reads six
public sources three times a day and writes to Supabase: raw `events` and `aqi_readings`,
and a **severity desk**, where every item (quake, flood, cyclone, fire activity per state,
national air quality) has a level from 1 to 4 and a reason. Each run is an **edition**,
numbered in `pipeline_runs`. The site, the **Situation Report**, prints each edition as a
newspaper front page from the desk tables; it no longer reads `events` or `aqi_readings`.

## Structure
- pipeline/: Python pipeline, runs on the Raspberry Pi (jobpi) via a systemd timer at
  09:00, 15:00 and 21:00 UTC (14:30, 20:30 and 02:30 IST). Details: pipeline/CLAUDE.md
- frontend/ — Vite + React frontend, Render static site (live at sentinel-frontend-8hem.onrender.com)
- docs/severity-pipeline.md: the severity desk's spec, decisions, current status and open
  follow-ups
- docs/situation-report-plan.md: the frontend's plan, decisions and the requests to the
  pipeline (P1–P8); docs/style-guide.md: how the site writes (every generated line follows it)
- docs/design/: design mock-ups for the site (DeskSeverity, DeskQuiet, DeskPhone, ItemFire,
  MapView, MapSymbols), read as visual and copy spec, not code

## Rules
- Never mix pipeline and frontend dependencies
- Pipeline: Python/pip, entry point is pipeline/pipeline.py
- Frontend: Node/npm, entry point is frontend/
- Each subdirectory has its own dependency files

## Pipeline run order
One run of `pipeline/pipeline.py`, in this order. Each severity stage (4-8) is isolated:
if one fails, the run is marked failed and alerts, but the other stages still run and
earlier writes stand.
1. Run record: a `pipeline_runs` row; its id is the edition number, and it keeps the
   thresholds (severity.toml) the edition runs with
2. Fetchers: FIRMS, EONET, GDACS, USGS, OpenAQ
3. Writes: `events` (EONET, GDACS, USGS; FIRMS hotspots go only to the fire stages and
   the local archive), `aqi_readings`, then each source's freshness on `sources`
4. Fire events (`fire.py`): FIRMS hotspots clustered into `fire_events` by district
5. Fire desk (`fire_desk.py`): one item per state, levelled on its ratio to the seasonal norm
6. Desk (`desk.py`): quakes, floods and cyclones
7. Air (`air.py`): the national air item; CPCB's real-time feed on data.gov.in first,
   OpenAQ as the fallback
8. Quiet-day desk (`watch.py`): watching list and per-category status
9. Archive old rows and the run's FIRMS hotspots to local SQLite, then cleanup (only if
   the archive succeeded)
10. Staleness check, then the run record is closed as ok or failed

## Working rules
- **Worktrees:** the timer runs whatever is checked out in the main checkout, so it stays
  on `main`. Build each work item in its own git worktree, test it (pytest and
  `pipeline.py --dry-run`), and fast-forward merge only tested steps into `main`. One work
  item at a time, each tested and committed separately. Steps, symlinks and clean-up:
  pipeline/CLAUDE.md, *Working on the pipeline*
- **Revert rule:** after a merge is verified on a live run, revert only if the changed
  stage itself fails. A run that fails because an unrelated outside source failed (GDACS,
  FIRMS, OpenAQ, data.gov.in) is not a reason to revert: keep the merge and report it.
- **Thresholds** live in `pipeline/severity.toml`, never in code.
- **Migrations** are numbered SQL files in `pipeline/migrations/`. Job pastes each one into
  the Supabase SQL editor (there is no DB URL on the Pi). Code that needs a migration is
  merged only after Job has applied it.
- **Grants:** only the service role (the pipeline) writes; anon and authenticated are
  read-only. Every migration that adds a table or view follows the pattern in
  pipeline/CLAUDE.md (*Supabase Data API grants*).
- **Tests and dry runs** never create `pipeline_runs` rows: a row is an edition.
- **Before pushing:** check that no secrets (`.env`, `.env.local`, keys) and no raw FIRMS
  archive are in the repo.

## Frontend

The Situation Report: one responsive site (the phone is the same site at narrow width),
read-only through the anon key. Plan and decisions: docs/situation-report-plan.md.

### Stack
- Vite 8 + React 19 + TypeScript, Tailwind CSS 3
- Leaflet (react-leaflet v5), raster tiles, no WebGL
- React Query (@tanstack/react-query) + @supabase/supabase-js, React Router 7
- Vitest for the desk logic (`npm test`)

### Dev
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev            # includes /dev/symbols
npm test
npm run build:preview  # the preview on the Pi: a build with /dev/symbols in it
```
Render runs the plain `npm run build`, which leaves the dev pages out.

### Environment Variables
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_DEV_PAGES=1 (optional): include `/dev/symbols` in a build

### Routes
`/` the latest edition's Desk, `/edition/:n` any edition as published, `/date/YYYY-MM-DD`
a day's edition (the first from 20:30 IST), `/item/:category/:ref` an item (`?edition=n`
for a past edition), `/map`, `/archive` (`?month=YYYY-MM`), `/sources`, `/about`.
Old addresses: `/insights` → `/archive`, `/dashboard` → `/map`, `/event/:id` → the desk
item whose `source_ref` is that event (else a short note). `/dev/symbols` draws every map
symbol (not linked, noindex).

### Key Patterns
- **Reads only the desk tables:** `pipeline_runs` (with `severity_config`),
  `desk_item_snapshots` (with `desk_items` embedded), `category_status`,
  `desk_watch_snapshots`, `desk_watch`, `fire_day_points`, `fire_events`,
  `fire_state_daily`. Hooks in `src/hooks/useEdition.ts`.
- **Each edition as published (plan P1-P4):** from edition 29 a snapshot carries its own
  title, place and position, and each edition keeps its watching list; editions 1-28 fall
  back to `desk_items` and (latest edition only) `desk_watch`. Every edition's level rules
  come from `pipeline_runs.severity_config` (`scale.ts`, `scaleFrom`); its fire map from
  `fire_day_points`, cut at the fire items' `data_to`.
- **Every line rebuilds for past editions:** templates in `src/lib/desk/` (copy, notes,
  words) read only the edition's own snapshots, its run time and the comparison with the
  edition about a day earlier (`changes.ts`), so `/edition/:n` prints the same words it
  did when published. `copy.test.ts` and `notes.test.ts` hold real editions' copy to the
  letter; fixtures in `src/lib/desk/__fixtures__/`.
- **Copy follows docs/style-guide.md:** news for ordinary readers, facts said plainly;
  caveats in each item's source line, the "As of" kicker and the page's Notes.
- **Ranking** (`entries.ts`): level, then cyclone, flood, earthquake, air, fire, then
  strength. Level 1 quakes are one row; fire states are one roundup unless Level 3+ or
  alone.
- **The level scale** for an edition is read from its `severity_config`; `SCALE` in
  `src/lib/desk/scale.ts` is the current rules, for fixtures and as the fallback.
- **Map** (`components/paper/PaperMap.tsx`, `mapSymbols.ts`): Esri World Light Gray tiles
  (keyless), warmed by a `.paper-map` filter in `index.css`; hazard symbols per
  docs/design/MapSymbols.dc.html; air squares per city from the air figures (P5, edition 30
  on); India's outline from `src/lib/desk/geo/india-coast.json`. Leaflet loads lazily,
  after the page's text.
- **Design tokens:** the paper palette in `src/index.css` `:root` (`--paper`, `--ink`,
  `--ink-muted`, `--rule`, `--fill`, `--fill-strong`, `--panel`, `--note`, `--accent`),
  aliased in `tailwind.config.js`.
- **Bundles:** the Desk is in the main chunk; other pages load on first visit; React,
  Supabase, React Query and Leaflet are chunks of their own (`vite.config.ts`).
