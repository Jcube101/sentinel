# Sentinel Monorepo

Sentinel tracks natural hazards in India. A Python pipeline on a Raspberry Pi reads six
public sources three times a day and writes to Supabase: raw `events` and `aqi_readings`
(what the live site shows today) and a **severity desk**, where every item (quake, flood,
cyclone, fire activity per state, national air quality) has a level from 1 to 4 and a
reason. Each run is an **edition**, numbered in `pipeline_runs`. The frontend phase that
shows the desk is next; the live site doesn't read the desk tables yet.

## Structure
- pipeline/: Python pipeline, runs on the Raspberry Pi (jobpi) via a systemd timer at
  09:00, 15:00 and 21:00 UTC (14:30, 20:30 and 02:30 IST). Details: pipeline/CLAUDE.md
- frontend/ — Vite + React frontend, Render static site (live at sentinel-frontend-8hem.onrender.com)
- docs/severity-pipeline.md: the severity desk's spec, decisions, current status and open
  follow-ups (including the pipeline changes planned for the frontend phase)
- docs/design/: design mock-ups for the desk frontend (DeskSeverity, DeskQuiet, DeskPhone,
  ItemFire, MapView)

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
3. Writes: `events`, `aqi_readings`, then each source's freshness on `sources`
4. Fire events (`fire.py`): FIRMS hotspots clustered into `fire_events` by district
5. Fire desk (`fire_desk.py`): one item per state, levelled on its ratio to the seasonal norm
6. Desk (`desk.py`): quakes, floods and cyclones
7. Air (`air.py`): the national air item; CPCB's real-time feed on data.gov.in first,
   OpenAQ as the fallback
8. Quiet-day desk (`watch.py`): watching list and per-category status
9. Archive old rows to local SQLite, then cleanup (only if the archive succeeded)
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

### Stack
- Vite + React 19 + TypeScript
- Tailwind CSS, Leaflet (react-leaflet v5), Supercluster, Recharts
- React Query (@tanstack/react-query) + @supabase/supabase-js
- Lucide React for icons

### Dev
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Environment Variables
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

### Routes
`/` Home, `/map` Live Map, `/insights` Insights, `/event/:id` Event detail,
`/about` About — `/dashboard` redirects to `/map` for old bookmarks/links.
Full IA history and ground rules in `frontend/ROADMAP.md` Phase 4.

### Key Patterns
- Per-category query limits in useNaturalEvents: fire 2000, earthquake 1000, flood/cyclone 500
- Home page uses 4 separate useNaturalEvents calls (one per category) for accurate stat counts,
  and reuses that same combined data for the Active Threats feed and mini-map preview
- SentinelMap accepts isLoading, interactive (disables drag/zoom for preview/locator use), and
  optional center/zoom overrides
- Design tokens live in `src/index.css` `:root` (`--bg`, `--surface`, `--border`, `--text`,
  `--muted`, `--accent`, `--cat-*` category hues, `--sev-*` severity ramp) and are aliased in
  `tailwind.config.js`. Tailwind can't apply opacity modifiers (e.g. `bg-accent/20`) to colors
  sourced from CSS variables — translucent chip backgrounds use inline hex + alpha suffix
  (`color + '33'`) instead, matching the pre-existing convention
- `lib/time.ts` (relativeTime, formatDate) and `lib/severity.ts` (severityScore/severityBucket,
  a 0-100 cross-category ranking blending each event's normalized `severity` label with
  recency) are shared by ThreatFeed, EventDetailPanel, and the EventDetail page
- Map tiles: Esri Dark Gray Canvas raster, no API key (base + Reference label layer,
  `{z}/{y}/{x}` order), darkened to the old CARTO Dark Matter look by a
  `.leaflet-tile-pane` filter in `index.css`. CARTO's dark_all now needs a key and
  watermarks every keyless tile. Leaflet renders raster tiles on the DOM, so the
  map needs no WebGL and works in every browser (the earlier MapLibre map showed
  a blank void when WebGL was unavailable)
- useAqiReadings queries aqi_readings directly (last 24h); AqiPanel is the only consumer,
  toggled from FilterBar, slides in from the left so it never collides with EventDetailPanel
  on the right
