# Sentinel Frontend

Vite + React + TypeScript app for the Sentinel natural disaster tracker.

## Stack

- React 19 + TypeScript 6
- Tailwind CSS 3
- Leaflet + react-leaflet v5 + supercluster
- Supabase client + React Query
- React Router
- Recharts
- Lucide icons

## Local Dev

```bash
cd frontend
npm install
cp .env.example .env.local
# fill in Supabase anon key in .env.local
npm run dev
```

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |

## Routes

`/` Home, `/map` Live Map, `/insights` Insights, `/event/:id` Event detail,
`/about` About. `/dashboard` redirects to `/map` for old links/bookmarks.
See [ROADMAP.md](ROADMAP.md) Phase 4 for how this IA came together.

## File Structure

```
src/
├── lib/           — Supabase client, types, relativeTime/formatDate, severityScore/severityBucket
├── hooks/         — React Query hooks (useNaturalEvents, useAqiReadings, useEvent)
├── pages/         — Landing (Home), LiveMap, Insights, EventDetail, About
├── components/
│   ├── map/       — SentinelMap, MapLegend
│   ├── layout/    — Navbar, Footer
│   └── ui/        — FilterBar, EventDetailPanel, StatsBar, AqiPanel, ThreatFeed,
│                     SeverityMeter, CommandPalette
└── index.css      — Design tokens (CSS custom properties: bg/surface/border/text/muted/
                      accent, category hues, severity ramp), aliased in tailwind.config.js
```
