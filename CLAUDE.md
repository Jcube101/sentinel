# Sentinel Monorepo

## Structure
- pipeline/ — Python pipeline, runs on Render cron job
- frontend/ — Vite + React frontend, Render static site (live at sentinel-frontend-8hem.onrender.com)

## Rules
- Never mix pipeline and frontend dependencies
- Pipeline: Python/pip, entry point is pipeline/pipeline.py
- Frontend: Node/npm, entry point is frontend/
- Each subdirectory has its own dependency files

## Frontend

### Stack
- Vite + React 19 + TypeScript
- Tailwind CSS, MapLibre GL (react-map-gl v8), Supercluster, Recharts
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
- Map tiles: OpenFreeMap dark style
