# Sentinel Monorepo

## Structure
- pipeline/: Python pipeline, runs on the Raspberry Pi (jobpi) via systemd timer, three times daily (09:00, 15:00, 21:00 UTC)
- frontend/ — Vite + React frontend, Render static site (live at sentinel-frontend-8hem.onrender.com)

## Rules
- Never mix pipeline and frontend dependencies
- Pipeline: Python/pip, entry point is pipeline/pipeline.py
- Frontend: Node/npm, entry point is frontend/
- Each subdirectory has its own dependency files

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
- Map tiles: CARTO dark raster. Leaflet renders raster tiles on the DOM, so the
  map needs no WebGL and works in every browser (the earlier MapLibre map showed
  a blank void when WebGL was unavailable)
- useAqiReadings queries aqi_readings directly (last 24h); AqiPanel is the only consumer,
  toggled from FilterBar, slides in from the left so it never collides with EventDetailPanel
  on the right
