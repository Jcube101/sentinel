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

### Key Patterns
- Per-category query limits in useNaturalEvents: fire 2000, earthquake 1000, flood/cyclone 500
- Landing page uses 4 separate useNaturalEvents calls (one per category) for accurate stat counts
- SentinelMap accepts an isLoading prop for a loading overlay
- Dark theme: background #0a0a0f, accent #f97316 (amber), muted text #7070a0
- Map tiles: CARTO dark raster. Leaflet renders raster tiles on the DOM, so the
  map needs no WebGL and works in every browser (the earlier MapLibre map showed
  a blank void when WebGL was unavailable)
- useAqiReadings queries aqi_readings directly (last 24h); AqiPanel is the only consumer,
  toggled from FilterBar, slides in from the left so it never collides with EventDetailPanel
  on the right
