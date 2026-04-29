# Sentinel Frontend

Vite + React + TypeScript dashboard for the Sentinel natural disaster tracker.

## Stack

- React 19 + TypeScript 6
- Tailwind CSS 3
- MapLibre GL JS + react-map-gl v8 + supercluster
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

## File Structure

```
src/
├── lib/           — Supabase client, types, constants
├── hooks/         — React Query hooks (useNaturalEvents, useAqiReadings)
├── pages/         — Landing, Dashboard
├── components/
│   ├── map/       — SentinelMap, EventMarkers, ClusterMarker
│   ├── layout/    — Navbar, Footer
│   └── ui/        — StatBadge, EventDetailPanel, FilterBar
└── index.css      — Design system (dark theme, category colours)
```
