# Sentinel Roadmap

## Phase 1 — Pipeline (COMPLETE ✅)
Data pipeline fetching from 5 APIs into Supabase.
See [pipeline/ROADMAP.md](pipeline/ROADMAP.md) for detail.

## Phase 2 — Frontend V1 (COMPLETE ✅)
Standalone Vite + React dashboard on Render.
Live at https://sentinel-frontend-8hem.onrender.com
See [frontend/ROADMAP.md](frontend/ROADMAP.md) for detail.

## Phase 3 — Frontend V2 (PLANNED 📋)
A first minimal AQI view (station list panel, toggled from the dashboard
filter bar) shipped Jul 2026. Map overlay with color-coded station markers,
cyclone tracks, and historical charts are still planned.
See [frontend/ROADMAP.md](frontend/ROADMAP.md) for detail.

## Phase 4 — Enhancements (FUTURE 💡)
Alerts, public API, expanded coverage.

---

## Build Log

| Date | Milestone |
|------|-----------|
| Apr 2026 | Pipeline complete — all 5 fetchers working |
| Apr 2026 | 100k+ events backfilled into Supabase |
| Apr 2026 | Render cron deployed, daily automation live |
| Apr 2026 | Monorepo restructured |
| Apr 2026 | Frontend scaffolded — Vite + React + TS + Tailwind + MapLibre + Supabase |
| Apr 2026 | Landing page built — hero with live stats, data sources, navbar, footer |
| May 2026 | Dashboard built — map, filters, clustering, event detail panel, stats bar |
| May 2026 | Frontend deployed on Render — live at sentinel-frontend-8hem.onrender.com |
| May 2026 | V1 cleanup — favicon, meta/OG tags, per-category landing stats, map loading overlay |
| Jun 2026 | Pipeline migrated from Render to Raspberry Pi (jobpi) — systemd timer, daily 01:00 UTC |
| Jul 2026 | Pipeline hardened: fail-loud fetchers, FIRMS overpass fix, archival wired in, rescheduled to 3x/day (09:00, 15:00, 21:00 UTC) |
| Jul 2026 | Staleness thresholds recalibrated from real history (dense vs event-driven sources), failure and staleness alerting added, first AQI view shipped to the dashboard |
