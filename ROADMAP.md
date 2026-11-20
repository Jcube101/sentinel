# Sentinel Roadmap

Status (20 Nov 2026): Phases 6 and 7 are complete. The Situation Report has been live
since 29 Oct 2026, installable and at sentinel.job-joseph.com since 17 Nov, and Part C
(below) is done. Since 30 Oct, fire levels use a new baseline and thresholds (from edition
83) and EONET is retired (from edition 86). The latest edition checked is 92 (20 Nov, 02:30
IST): ok, every source ok. What's next is at the end.

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
Light mode, alerts/subscribe (now push alerts, under What's next), public API, expanded
coverage.

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

Added on 17 Nov: the site is an installable app (PWA). It opens offline with the last
saved edition under a banner that names it, goes to the network first so a normal open
shows the latest edition, and updates itself after a deploy (plan, section 9).

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
| Nov 2026 | Fire levels recalibrated (decided 15 Nov, live from edition 83): norms from 2023–2025, a static-source mask from six years with a persistence rule, Level 3 at 6× norm with at least 40 fire events, Level 4 needs two hotspots, and the caps that held satellite fire levels at 2 lifted; only Orange and Red GDACS wildfire alerts lift a state to Level 3 |
| Nov 2026 | The Desk's headlines rewritten: one main event and a strong verb, chosen by newsworthiness; fire copy gives place, direction and benchmark |
| Nov 2026 | An incomplete data.gov.in snapshot is read once more after 90 s, then the air item falls back to OpenAQ (statuses `stale` / `incomplete`, migration 010); the first run after a gap alerts with the editions that never ran |
| Nov 2026 | The Situation Report is installable (PWA): opens offline with the last saved edition, says so in a banner, updates itself after a deploy |
| Nov 2026 | The site moves to its own domain, sentinel.job-joseph.com (the Render address still answers) |
| Nov 2026 | Fire items close after five complete days below Level 2 (was 48 h); a close line against flicker was tested and rejected |
| Nov 2026 | EONET retired from edition 86 (its `events` rows kept); an edition fails only when something the desk depends on failed, and every failure still alerts |
| Nov 2026 | Link previews show a paper card: the level squares over the masthead's SENTINEL |

---

## What's next

None of these is scheduled. Detail in [docs/severity-pipeline.md](docs/severity-pipeline.md)
(*Follow-ups*) and [docs/situation-report-plan.md](docs/situation-report-plan.md)
(*Open follow-ups*).

- **Fire calibration.** The seasonal norms come from FIRMS's reprocessed archive (SP); the
  live feed is near-real-time (NRT). Once SP covers Jul–Sep 2026, compare it with the NRT
  hotspots kept in the local archive and scale the norms if needed. The caps that held
  satellite-based fire levels at 2 were lifted on 15 Nov (`ratio_level_cap` 3,
  `near_people_cap` 4; live from edition 83), so any gap between the two now shows in the
  levels readers see.
- **Fire thresholds and flicker.** 40 fire events / 2× / 6× (15 Nov, from an out-of-sample
  replay of 2020–2025) and the five-day close (17 Nov) are set. Recheck them against a
  month of live data (`tools/replay_fire_levels.py`), with the one untested idea for a
  Level 2 story that drops and comes back: keep it until two days in a row are under 2×.
- **Static mask gaps.** The persistence rule and exclusion file (15 Nov) filled most of
  them, and a single hotspot can no longer make Level 4 (the replayed Dhanbad case, in
  the Jharia coal field, was one). Keep checking live Level 4 candidates near mining areas
  and power plants.
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
- **Switch off the old Render address** (planned, not scheduled). The site has been at
  sentinel.job-joseph.com since 17 Nov 2026; Render's own address,
  sentinel-frontend-8hem.onrender.com, still answers ([plan](docs/situation-report-plan.md),
  section 9, *The site's address*). To check first:
  - *Redirect or disable.* A redirect keeps old links working; turning the address off
    breaks them. Render's redirect rules match paths, not hosts, so check whether a
    redirect from the old host is possible at all, and what the address returns once it
    is off.
  - *Apps installed from the old address* are a separate install, with their own service
    worker and saved editions. Neither choice reaches them: the worker keeps serving its
    saved shell and reading Supabase directly, but can no longer update, so they stay
    frozen at their last version. Before switching off, ship a notice shown only on the
    old host that the site has moved (install it again from the new address), and leave
    it up for a while.
  - *Old shared links* (chats, posts, link previews other sites have cached) keep working
    only with a redirect.
  - Afterwards, update the docs that name the address (CLAUDE.md, frontend/README.md,
    plan section 9).
- **Push alerts for Level 3+ items** (planned, not scheduled). A notification when an item
  reaches Level 3 or 4, for readers who opt in. This reverses the installable app's "no
  push notifications" (Job, 17 Nov 2026; plan, section 9). These are reader alerts, apart
  from the pipeline's failure alerts to the webhook.
  - *A small backend for web push.* Anon is read-only, so the site can't store a
    subscription itself: it needs an endpoint that writes it with the service role, into
    a new private table (a migration, with the grants pattern), and a VAPID key pair (the
    public key in the site's build, the private key only on the Pi). The pipeline sends
    after the desk stages: once when an item reaches Level 3+, not every edition it stays
    there; it drops subscriptions the push service reports gone; tests and dry runs never
    send.
  - *The site:* an opt-in page, and `push` / `notificationclick` handlers in `src/sw.ts`;
    a tap opens the item as of that edition.
  - *iOS limits:* web push works only on iOS 16.4 and later, for the site added to the
    Home Screen, never in a Safari tab, and permission can only be asked from a tap inside
    the installed app.
  - *Copy:* an alert follows [docs/style-guide.md](docs/style-guide.md) like the desk. The
    desk's lines are written in the frontend (`src/lib/desk/`) but the pipeline would
    send the alert, so the words need one source: port the templates to the pipeline with
    tests holding the same lines, or send only what the pipeline already stores (the
    item's title and level), checked against the guide.

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
