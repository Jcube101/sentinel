# Sentinel Frontend: the Situation Report

A newspaper-style front page for natural hazards in India. Each pipeline run is an
edition; the site prints it as a ranked desk of stories (cyclones, floods, earthquakes,
air quality, fires), each with a level from 1 to 4, written as news for ordinary readers.
One responsive site: the phone is the same site at narrow width. Read-only, through the
Supabase anon key.

Plan, decisions and the requests to the pipeline: [docs/situation-report-plan.md](../docs/situation-report-plan.md).
How the site writes: [docs/style-guide.md](../docs/style-guide.md). Design mock-ups:
[docs/design/](../docs/design/).

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

## Build

```bash
npm run build          # what Render runs; output in dist/
npm run build:preview  # the same, with /dev/symbols included (VITE_DEV_PAGES=1)
```

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
│   ├── archive.ts, quiet.ts, item.ts, mapdata.ts, sources.ts, scale.ts, …
│   └── __fixtures__/    —   real editions, for the tests
├── pages/               — Desk, Item, MapPage, Archive, DatePage, Sources, About,
│                          EventRedirect, Placeholder (not found), dev/Symbols
├── components/paper/    — the newspaper parts: PaperShell, DeskEntryRow, DeskHero,
│                          PaperMap + mapSymbols, MiniMap, QuietDesk, SinceYesterday, …
└── index.css            — the paper palette, the map's tile filter, the Level 4 pulse
```
