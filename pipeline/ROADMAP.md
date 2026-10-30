# Sentinel Pipeline — Roadmap

## Phase 1 — Core Pipeline (COMPLETE ✅)
- [x] Supabase schema (events, aqi_readings, sources, categories)
- [x] NASA FIRMS fetcher
- [x] NASA EONET fetcher
- [x] GDACS fetcher
- [x] USGS fetcher
- [x] OpenAQ fetcher
- [x] pipeline.py orchestrator
- [x] backfill.py for historical data
- [x] archive.py → local SQLite
- [x] 60-day rolling cleanup on Supabase
- [x] Windows Task Scheduler automation (retired: `setup_task_scheduler.ps1`
      removed from the repo, the Windows scheduled task disabled by Job;
      archival runs only on the Pi, see below)
- [x] Render cron job (daily 6:30am IST) (legacy, superseded by the Pi migration below)
- [x] Migrated to Raspberry Pi (jobpi), systemd timer pair, rescheduled to 3x daily
      (09:00, 15:00, 21:00 UTC) after the original 01:00 UTC schedule was found to
      predate the FIRMS overpass every day
- [x] Monorepo restructure
- [x] Fail-loud fetchers: request/parse failures now propagate and fail the run,
      instead of returning an empty list that reads identically to a quiet day
- [x] archive.py wired directly into pipeline.py, immediately before cleanup, so
      cleanup can never delete un-archived data
- [x] Per-source staleness thresholds recalibrated from real Supabase history
      (dense sources: FIRMS/USGS/OpenAQ; event-driven: EONET/GDACS, not alerted on
      row age)
- [x] Failure and staleness alerting via an optional webhook (notify.py), with an
      OnFailure= systemd hook for failures the process can't self-report

## Phase 2 — Pipeline Improvements (PLANNED 📋)
- [x] OpenAQ pagination: pages through every Indian location, then pulls sensors
      for up to 120, most recently reporting first (Sep 2026)
- [ ] Tighter India bbox to reduce border noise
- [x] Retry logic for transient API failures: every fetcher tries 3 times on
      timeouts and connection errors (Sep 2026); GDACS timeouts don't fail the
      run, FIRMS timeouts only on a second one in a row (Oct 2026)
- [x] Webhook alert on pipeline failure or dense-source staleness (see above),
      live end to end: `NOTIFY_WEBHOOK_URL` points at an n8n workflow that
      emails Job via Gmail, tested for real from the Pi
- [x] ~~FIRMS backfill beyond 30 days~~: superseded. FIRMS hotspots no longer go to
      `events` (29 Oct 2026); the 2024–2025 SP archive behind the fire baseline is pulled by
      `tools/pull_firms_archive.py`, and live hotspots are kept in the local archive

## Severity desk (COMPLETE ✅, Oct 2026)
Spec, decisions, status and follow-ups: `docs/severity-pipeline.md`.
- [x] Editions (`pipeline_runs`) and per-source freshness on `sources`
- [x] Desk items for quakes, floods and cyclones, with a snapshot per run
- [x] National air item: CPCB real-time AQI from data.gov.in, OpenAQ fallback
- [x] Fire events: FIRMS hotspots clustered by district, static heat-source mask
- [x] Seasonal fire norm from the 2024–2025 archive; one fire item per state
- [x] Quiet-day desk: watching list, category status, 14-day strip
- [x] Reliability fixes (28 Oct): air fallback never uses older data, GDACS 90 s
      read timeout and no droughts, FIRMS fails only on a second timeout
- [x] Fire levels only from complete days (night pass in); GDACS split into three
      queries, floods and cyclones first (29 Oct)
- [x] P1–P7 for the Situation Report: per-edition titles, places, watching lists,
      thresholds and fire map points (migration 008), air city positions, each fire
      state's national rank, a cyclone's position (29 Oct)
- [x] Part C: FIRMS hotspots out of `events` (local archive only, live since edition 31);
      `events`, `aqi_readings`, `sources` and `categories` private (migration 009); `events`
      vacuumed (29–30 Oct)
- [x] Cyclones close 24 h after their last advisory; latest wind, peak, track and
      landfall from GDACS's advisory timeline (30 Oct, live in edition 32)
- [ ] Open follow-ups (detail in the spec, *Follow-ups*): fire calibration (live vs
      archive counts, then the Level 2 cap), fire threshold tuning, static mask gaps,
      data.gov.in reliability, the cyclone reopen path (tested offline only), and two
      rules not yet exercised live (the air fallback's older-data guard, FIRMS failing
      only on a second timeout)

## Phase 3 — Pipeline Enhancements (FUTURE 💡)
- [ ] Additional data source for floods (GDACS coverage is thin)
- [ ] Expand bbox beyond India if project grows
- [ ] Pipeline health dashboard endpoint
