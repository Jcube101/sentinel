# Sentinel Frontend: the Situation Report

A newspaper-style front page for natural hazards in India. Each pipeline run is an
edition; the site prints it as a ranked desk of stories (cyclones, floods, earthquakes,
air quality, fires), each with a level from 1 to 4, written as news for ordinary readers.
One responsive site: the phone is the same site at narrow width. Read-only, through the
Supabase anon key.

Live since 29 Oct 2026 at https://sentinel-frontend-8hem.onrender.com.

Plan, decisions and the requests to the pipeline: [docs/situation-report-plan.md](../docs/situation-report-plan.md).
How the site writes: [docs/style-guide.md](../docs/style-guide.md). Design mock-ups:
[docs/design/](../docs/design/).

## How it fits with the pipeline

The pipeline (`../pipeline/`) runs on a Raspberry Pi at 09:00, 15:00 and 21:00 UTC (14:30,
20:30 and 02:30 IST). Each run is an edition, numbered in `pipeline_runs`, and writes the
severity desk to Supabase. The site reads only the desk tables, through the anon key, which
can read them and write nothing:

| Table | What the site takes from it |
|---|---|
| `pipeline_runs` | Editions: number, time, status, each source's answer, `severity_config` (the level rules the edition ran with) |
| `desk_item_snapshots` (with `desk_items` embedded) | Every item in every edition: level, reason, figures, change; title, place and position from edition 29 |
| `desk_items` | An item's current row (item pages, `/event/:id` redirects) |
| `category_status` | The all-clear lines and which categories are last-known |
| `desk_watch_snapshots`, `desk_watch` | The watching list (per edition from 29; `desk_watch` for the latest before that) |
| `fire_day_points`, `fire_events` | The fire dots on the maps |
| `fire_state_daily` | A state's daily fire counts on its item page |

All reads are in `src/hooks/useEdition.ts`. The site doesn't read `events`, `aqi_readings`,
`sources` or `categories`; since migration 009 the anon key can't. Fields that only later
editions carry (title and place from 29; air positions, fire rank and cyclone position from
30; cyclone winds from 32) each have a fallback for older editions; the field names are in
the plan, *Delivered by the pipeline session*.

## Stack

- React 19 + TypeScript 6, Vite 8
- Tailwind CSS 3 (the paper palette in `src/index.css`)
- Leaflet + react-leaflet v5 (raster tiles, no WebGL)
- Supabase client + React Query, React Router 7
- Vitest

## Local dev

```bash
cd frontend
npm install
cp .env.example .env.local
# fill in the Supabase URL and anon key in .env.local
npm run dev
npm test
```

## Build and deploy

```bash
npm run lint
npm run build          # what Render runs; output in dist/
npm run build:preview  # the same, with /dev/symbols included (VITE_DEV_PAGES=1)
```

Render builds `main` as a static site (`render.yaml`: `npm install && npm run build` in
`frontend/`, publish `dist/`, every path rewritten to `index.html` for the router). A push
to `main` is live about a minute later.

## Working on the frontend

The main checkout stays on `main` (the Pi's timer runs the pipeline from it), so:

1. Build each work item in its own git worktree (`git worktree add -b frontend/x
   ../sentinel-x main`). Symlink its `frontend/.env.local` to the main checkout's and run
   `npm ci` in its `frontend/`.
2. Test: `npm test`, `npm run lint`, `npm run build` and `npm run build:preview`. Check the
   preview (`npx vite preview`) against live data at desktop and phone width. The site
   only reads, so a preview never changes anything.
3. Commit. Before merging, check that `main` = `origin/main`. One session merges into or
   pushes `main` at a time. If the change reads new pipeline fields, the pipeline change
   merges first and is verified on a live edition; rebase onto `main` and rerun the tests.
4. In the main checkout: `git merge --ff-only <branch>`, check for secrets (`.env`,
   `.env.local`, keys), local paths and FIRMS archive files, then push.
5. After Render deploys, check the live site: the Desk, an edition, a `/date` page,
   Archive, Map, an item page and Sources.
6. Remove the worktree: check it is clean and merged, delete the `.env.local` symlink, then
   `git worktree remove <path>` (no `--force`) and `git branch -d <branch>`.

Every generated line follows `docs/style-guide.md`, and the tests hold real editions' copy
to the letter: change the guide and the tests together.

## Environment variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_DEV_PAGES` | `1` to include `/dev/symbols` in a build (dev always has it) |

## Routes

| Route | Page |
|---|---|
| `/` | The latest edition's Desk |
| `/edition/:n` | Any edition, as it was published |
| `/date/YYYY-MM-DD` | A day's edition (the first from 20:30 IST, else the day's latest) |
| `/item/:category/:ref` | One item; `?edition=n` shows it as of a past edition |
| `/map` | The map: hazard symbols, the day's fires, the items list |
| `/archive` | Every day with an edition, a month at a time (`?month=YYYY-MM`) |
| `/sources` | How each source answered in each edition |
| `/about` | How levels are set, source lines and marks, credits |
| `/dev/symbols` | Every map symbol at every level (not linked, noindex) |

Old addresses: `/insights` → `/archive`, `/dashboard` → `/map`, `/event/:id` → the desk
item made from that event (else a short note).

## File structure

```
src/
├── App.tsx              — routes; every page but the Desk loads lazily
├── hooks/useEdition.ts  — every read: editions, snapshots, comparisons, items, fires, archive
├── lib/desk/            — the desk logic, pure and tested:
│   ├── entries.ts       —   snapshots → ranked desk rows (quake group, fire roundup)
│   ├── changes.ts       —   Since yesterday: the comparison with the edition a day earlier
│   ├── copy.ts, words.ts —  headlines, titles, standfirsts (docs/style-guide.md)
│   ├── notes.ts         —   source lines, the "As of" kicker, the page's Notes
│   ├── cards.ts         —   the evidence under each story
│   ├── where.ts, geo/   —   places in plain words (coasts, seas, India's outline)
│   ├── scale.ts         —   each edition's level rules (pipeline_runs.severity_config)
│   ├── watch.ts         —   an edition's watching list (desk_watch_snapshots)
│   ├── wind.ts          —   a cyclone's latest wind and its peak (edition 32 on)
│   ├── archive.ts, quiet.ts, item.ts, mapdata.ts, sources.ts, …
│   └── __fixtures__/    —   real editions, for the tests
├── pages/               — Desk, Item, MapPage, Archive, DatePage, Sources, About,
│                          EventRedirect, Placeholder (not found), dev/Symbols
├── components/paper/    — the newspaper parts: PaperShell, DeskEntryRow, DeskHero,
│                          PaperMap + mapSymbols, MiniMap, QuietDesk, SinceYesterday, …
└── index.css            — the paper palette, the map's tile filter, the Level 4 pulse
```
