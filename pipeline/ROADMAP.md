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
- [ ] OpenAQ pagination (currently capped at 50 locations)
- [ ] Tighter India bbox to reduce border noise
- [ ] Retry logic for transient API failures
- [x] Webhook alert on pipeline failure or dense-source staleness (see above),
      live end to end: `NOTIFY_WEBHOOK_URL` points at an n8n workflow that
      emails Job via Gmail, tested for real from the Pi
- [ ] FIRMS backfill beyond 30 days (SP source coverage gaps investigation)

## Phase 3 — Pipeline Enhancements (FUTURE 💡)
- [ ] Additional data source for floods (GDACS coverage is thin)
- [ ] Expand bbox beyond India if project grows
- [ ] Pipeline health dashboard endpoint
