# Sentinel Roadmap

Status (30 Oct 2026): Phases 6 and 7 are complete. The Situation Report has been live
since 29 Oct 2026, and Part C (below) is done. What's next is at the end.

## Phase 1 — Pipeline (COMPLETE ✅)
Data pipeline fetching from 5 APIs into Supabase.
See [pipeline/ROADMAP.md](pipeline/ROADMAP.md) for detail.

## Phase 2 — Frontend V1 (COMPLETE ✅, replaced by Phase 7)
Standalone Vite + React dashboard on Render, at
https://sentinel-frontend-8hem.onrender.com until the Situation Report replaced it.
See [frontend/ROADMAP.md](frontend/ROADMAP.md) for detail.

## Phase 3 — Frontend V2 (SUPERSEDED)
A first minimal AQI view (station list panel, toggled from the dashboard
filter bar) shipped Jul 2026. The rest (an AQI map overlay, cyclone tracks,
historical charts) was overtaken by Phase 7: the Situation Report has air squares on
the map and charts on item pages; drawing a cyclone's track is under What's next.

## Phase 4 — Frontend UI / IA Revamp (COMPLETE ✅, replaced by Phase 7)
A fresh look and a real information architecture: CSS design tokens, multi-page
IA (Home / Live Map / Insights / Event detail / About), a live "Active Threats"
feed, client-side severity scoring, and a Recharts insights page. These pages were
removed when the Situation Report went live. Execution spec in
[frontend/ROADMAP.md](frontend/ROADMAP.md) Phase 4.

## Phase 5 — Enhancements (FUTURE 💡)
Light mode, alerts/subscribe, public API, expanded coverage.

## Phase 6 — Severity desk pipeline (COMPLETE ✅)
Every desk item on one 1–4 severity scale with a reason, so fire hotspots no
longer swamp every count: editions and per-source freshness, quake / flood /
cyclone items, a national air item (CPCB real-time AQI from data.gov.in, OpenAQ
as fallback), FIRMS hotspots clustered into fire events with a seasonal norm per
state, a snapshot of every item per run, and a quiet-day desk. Built 20–21 Oct 2026.
Later: reliability fixes (28 Oct), fire levels only from complete days and the GDACS
split (29 Oct), the per-edition archive the site needs (migration 008, 29 Oct), and the
cyclone close rule with the latest wind, track and landfall (30 Oct, live in edition 32).
Spec, decisions, verification status and open follow-ups:
[docs/severity-pipeline.md](docs/severity-pipeline.md).

**Part C (COMPLETE ✅, 29–30 Oct 2026):** once the new site stopped reading the old
tables, FIRMS hotspots stopped going to `events` (they go to the fire stages and the local
archive; live since edition 31), the 38,531 FIRMS rows already there were archived locally
and deleted, `events` was vacuumed (118 MB to under 1 MB), and migration 009 made `events`,
`aqi_readings`, `sources` and `categories` private.

## Phase 7 — Severity desk frontend: the Situation Report (COMPLETE ✅, live 29 Oct 2026)
The site rebuilt as a newspaper front page over the desk tables (mock-ups in
[docs/design/](docs/design/)): a Desk per edition with stories ranked by level and
written as news ([docs/style-guide.md](docs/style-guide.md)), Since yesterday, a quiet-day
desk, item pages, a map with a symbol per hazard, an archive by day, a Sources page and
About with the data credits. Every edition reads as it was published. Built 28–29 Oct,
live since 29 Oct 2026 (about 22:30 IST). Added on 30 Oct: air squares on the map, a fire
state's national rank, the cyclone's own position, latest wind and closing line, and a
collapsed map key. Plan, decisions and the requests to the pipeline (P1–P8, all delivered):
[docs/situation-report-plan.md](docs/situation-report-plan.md).

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
| Jun 2026 | Pipeline migrated from Render to Raspberry Pi (jobpi) — systemd timer, three times daily (09:00, 15:00, 21:00 UTC) |
| Jul 2026 | Pipeline hardened: fail-loud fetchers, FIRMS overpass fix, archival wired in, rescheduled to 3x/day (09:00, 15:00, 21:00 UTC) |
| Jul 2026 | Staleness thresholds recalibrated from real history (dense vs event-driven sources), failure and staleness alerting added, first AQI view shipped to the dashboard |
| Jul 2026 | Alerting live end to end (n8n webhook to Gmail, tested for real from the Pi); Windows Task Scheduler archival fully retired, `setup_task_scheduler.ps1` removed |
| Jul 2026 | Frontend map migrated from MapLibre (WebGL) to Leaflet (DOM tiles) so it works without WebGL |
| Jul 2026 | Phase 4 UI/IA revamp shipped — new IA (Home/Live Map/Insights/Event detail/About), design tokens, live Active Threats feed, client-side severity scoring, Recharts insights page, command palette |
| Sep 2026 | Every fetcher retries timeouts and connection errors; GDACS timeouts no longer fail the run; OpenAQ picks stations by recency |
| Oct 2026 | Map basemap moved from CARTO to keyless Esri Dark Gray Canvas |
| Oct 2026 | Severity desk pipeline (Phase 6, steps 0–7) built and live: editions, desk items, fire events and seasonal baseline, quiet-day desk |
| Oct 2026 | CPCB real-time AQI from data.gov.in becomes the air item's primary source |
| Oct 2026 | Reliability fixes after a health review of editions 11–24: the air fallback never uses older data, GDACS gets a 90 s read timeout and no droughts, FIRMS fails a run only on a second timeout in a row |
| Oct 2026 | Fire levels only from complete satellite days; GDACS split so flood and cyclone alerts come first and can't be lost to a wildfire or quake page |
| Oct 2026 | The Situation Report (Phase 7) replaces the old site on 29 Oct: the desk as a newspaper front page, an archive of every edition, hazard map symbols, copy written to a style guide |
| Oct 2026 | Part C: FIRMS hotspots out of Supabase's `events` (local archive only), the older tables private (migration 009), `events` vacuumed |
| Oct 2026 | Cyclones close 24 h after their last advisory, with the latest wind next to the peak; Cyclone Arnab closed in edition 32 (30 Oct) |

---

## What's next

None of these is scheduled. Detail in [docs/severity-pipeline.md](docs/severity-pipeline.md)
(*Follow-ups*) and [docs/situation-report-plan.md](docs/situation-report-plan.md)
(*Open follow-ups*).

- **Fire calibration.** The seasonal norms come from FIRMS's reprocessed archive (SP); the
  live feed is near-real-time (NRT). Once SP covers Jul–Sep 2026, compare it with the NRT
  hotspots kept in the local archive, scale the norms if needed, then decide whether to
  lift the cap that holds satellite-based fire levels at 2.
- **Fire threshold tuning.** 25 fires / 2× / 4× came from an in-sample replay of
  2024–2025; recheck against a few weeks of live items (`tools/replay_fire_levels.py`).
- **Static mask gaps.** A replayed Level 4 near Dhanbad (Jharia coal field) is probably a
  coal-seam fire the heat-source mask missed; check live Level 4 candidates near mining
  areas.
- **data.gov.in reliability.** CPCB's feed failed in editions 21–22 and recovered by
  itself. Keep watching how often the air item falls back to OpenAQ.
- **Cyclone reopening.** A closed cyclone reopens on a new advisory; that path is tested
  offline only, since no storm has reopened yet.
- **Not yet exercised live:** the air fallback's guard against older data, and FIRMS
  failing a run only on a second timeout in a row (both tested offline).
- **Site:** the cyclone's track isn't drawn on the map; the map's activity-grid and
  vs-norm modes (they need a state outline file); a quiet desk has never appeared live
  (every edition through 32 had a Level 2+ item), so it has only been checked with
  simulated data.

## Follow-ups / Known Issues

Recorded so these aren't lost or re-raised from scratch next time someone
looks at this project.

- **`supabase` 2.15.0 to 2.31.0 upgrade.** Still pinned at 2.15.0 (28 Oct
  2026). When last checked it was 16 minor versions behind, and the
  sub-packages (`postgrest`, `realtime`, `storage3`) are pinned well below
  what 2.31.0 expects. Do this as a reviewed run, not unattended: the writes
  this pipeline depends on could break in a way that only shows up against
  real data.
- **`FIRMS_MAP_KEY` was not rotated.** It's a free-tier key that was only
  ever exposed in local terminal output and journald, never committed to
  the repo. Deliberately left as-is; this is a recorded decision, not an
  oversight.
