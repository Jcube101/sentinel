# Sentinel Roadmap

## Phase 1 — Pipeline (COMPLETE ✅)
- [x] Supabase schema design (events, aqi_readings, sources, categories tables)
- [x] NASA FIRMS fetcher (fire hotspots)
- [x] NASA EONET fetcher (wildfires, cyclones)
- [x] GDACS fetcher (floods, cyclones, earthquakes)
- [x] USGS fetcher (earthquakes)
- [x] OpenAQ fetcher (AQI readings)
- [x] pipeline.py orchestrator
- [x] backfill.py for historical data
- [x] archive.py for local SQLite archiving
- [x] 60-day rolling cleanup on Supabase
- [x] Windows Task Scheduler for automated archiving
- [x] Render cron job (daily 6:30am IST)
- [x] Monorepo restructure (pipeline/ + frontend/)

## Phase 2 — Frontend V1 (IN PROGRESS 🔧)

### Infrastructure
- [ ] Vite + React + TypeScript scaffold in frontend/
- [ ] Standalone design system:
      Background: #0a0a0f (near-black)
      Accent: #f97316 (amber-orange)
      Typography: Inter or DM Sans
      Dark, utilitarian, data-forward
      Separate visual identity from job-joseph.com
- [ ] MapLibre GL JS + react-map-gl v8 + supercluster
- [ ] Supabase client (anon key, env vars set on Render)
- [ ] React Query for data fetching
- [ ] Deployed as Render static site (separate service from cron job, same repo)
- [ ] render.yaml updated for both services

### Landing page (/)
- [ ] Hero: what Sentinel is in one sentence
- [ ] Live event count stats pulled from Supabase (fires, floods, cyclones, earthquakes)
- [ ] "Open Live Map" CTA → /dashboard
- [ ] Data sources attribution (NASA, USGS, UN GDACS, OpenAQ)
- [ ] Last updated timestamp
- [ ] Footer with GitHub link

### Dashboard page (/dashboard)
- [ ] MapLibre GL map centred on India
      Dark OpenFreeMap tiles
      Initial view: lon 82.8, lat 22.5, zoom 4.2
- [ ] Coloured event markers by category:
      fire → #ef4444
      flood → #3b82f6
      cyclone → #8b5cf6
      earthquake → #f59e0b
- [ ] Supercluster clustering for dense FIRMS hotspots
- [ ] Category filter toggles (fire/flood/cyclone/earthquake)
- [ ] Status filter (open / closed / all)
- [ ] Days range selector (7 / 30 / 90 days)
- [ ] Event detail panel on marker click
      (bottom sheet mobile, side panel desktop)
- [ ] Stats bar — Recharts event counts over time
- [ ] Mobile responsive (390px baseline)
- [ ] Loading and empty states

### Data layer
- [ ] src/lib/supabase.ts
- [ ] src/hooks/useNaturalEvents.ts (React Query, 15min stale, limit 5000)
- [ ] src/hooks/useAqiReadings.ts (React Query, 30min stale, last 24h)

## Phase 3 — Frontend V2 (PLANNED 📋)
- [ ] AQI heatmap overlay layer
- [ ] Cyclone track lines from EONET geometry
- [ ] Historical trend charts (90-day view)
- [ ] Tighter India bbox filtering
- [ ] OpenAQ pagination for more stations
- [ ] Custom subdomain (sentinel.job-joseph.com)

## Phase 4 — Enhancements (FUTURE 💡)
- [ ] Alert/notification system for high severity events
- [ ] Public API endpoint for Sentinel data
- [ ] OpenAPI documentation
- [ ] Flood season historical analysis (June-September)
- [ ] Expand coverage beyond India

---

## Build Log

| Date | Milestone |
|------|-----------|
| Apr 2026 | Pipeline complete — all 5 fetchers working |
| Apr 2026 | 100k+ events backfilled into Supabase |
| Apr 2026 | Render cron deployed, daily automation live |
| Apr 2026 | Monorepo restructured (sentinel-pipeline → sentinel) |
| Apr 2026 | Frontend V1 in progress |
