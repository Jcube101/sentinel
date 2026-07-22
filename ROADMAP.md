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

## Phase 4 — Frontend UI / IA Revamp (PLANNED 📋)
A fresh look and a real information architecture: CSS design tokens, multi-page
IA (Home / Live Map / Insights / Event detail / About), a live "Active Threats"
feed, client-side severity scoring, and a Recharts insights page. India-scoped,
no pipeline or schema changes. Full execution spec (6 sub-steps, one-shottable)
in [frontend/ROADMAP.md](frontend/ROADMAP.md) Phase 4.

## Phase 5 — Enhancements (FUTURE 💡)
Light mode, alerts/subscribe, public API, expanded coverage.

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
| Jul 2026 | Alerting live end to end (n8n webhook to Gmail, tested for real from the Pi); Windows Task Scheduler archival fully retired, `setup_task_scheduler.ps1` removed |

---

## Follow-ups / Known Issues

Recorded so these aren't lost or re-raised from scratch next time someone
looks at this project.

- **`supabase` 2.15.0 to 2.31.0 upgrade.** 16 minor versions behind, and the
  sub-packages (`postgrest`, `realtime`, `storage3`) are pinned well below
  what 2.31.0 expects. Do this as a reviewed run, not unattended: the writes
  this pipeline depends on could break in a way that only shows up against
  real data.
- **`FIRMS_MAP_KEY` was not rotated.** It's a free-tier key that was only
  ever exposed in local terminal output and journald, never committed to
  the repo. Deliberately left as-is; this is a recorded decision, not an
  oversight.
