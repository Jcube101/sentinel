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
- [x] Windows Task Scheduler automation
- [x] Render cron job (daily 6:30am IST)
- [x] Migrated to Raspberry Pi (jobpi) — systemd timer pair, daily 01:00 UTC (6:30am IST)
- [x] Monorepo restructure

## Phase 2 — Pipeline Improvements (PLANNED 📋)
- [ ] OpenAQ pagination (currently capped at 50 locations)
- [ ] Tighter India bbox to reduce border noise
- [ ] Retry logic for transient API failures
- [ ] Slack/email alert if pipeline fails 2x in a row
- [ ] FIRMS backfill beyond 30 days (SP source coverage gaps investigation)

## Phase 3 — Pipeline Enhancements (FUTURE 💡)
- [ ] Additional data source for floods (GDACS coverage is thin)
- [ ] Expand bbox beyond India if project grows
- [ ] Pipeline health dashboard endpoint
