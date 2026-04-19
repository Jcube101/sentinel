# Roadmap

---

## Phase 1 — Pipeline (COMPLETE)

- [x] Supabase schema design (events + aqi_readings tables)
- [x] FIRMS fetcher — NASA fire hotspots via VIIRS NOAA-20
- [x] EONET fetcher — NASA wildfires + severe storms
- [x] GDACS fetcher — floods, cyclones, earthquakes
- [x] USGS fetcher — earthquakes M4.0+
- [x] OpenAQ fetcher — PM2.5, PM10, NO2, SO2, O3 for Indian cities
- [x] pipeline.py orchestrator — batched upsert, error isolation, summary log

---

## Phase 2 — Backfill & Deployment (IN PROGRESS)

- [x] backfill.py — historical data load for events table (FIRMS/EONET/GDACS/USGS, --source, --days CLI)
- [ ] Render cron job — deploy pipeline.py on 30-minute schedule
- [ ] Environment variables configured on Render dashboard
- [ ] Add unique constraint for aqi_readings on Supabase

---

## Phase 3 — Frontend (PLANNED)

- [ ] Sentinel page on job-joseph.com
- [ ] MapLibre GL map with event markers
- [ ] Category filters (fire / flood / cyclone / earthquake)
- [ ] Event detail sidebar on marker click
- [ ] AQI overlay layer
- [ ] Stats bar with Recharts (event counts by category)

---

## Phase 4 — Enhancements (FUTURE)

- [ ] Cyclone track lines rendered from EONET multi-point geometry
- [ ] FIRMS hotspot clustering for dense fire regions
- [ ] Historical trend charts (events over time)
- [ ] Alert / notification system for extreme-severity events
- [ ] Tighter India bbox filtering (state-level polygons)
- [ ] OpenAQ pagination to cover more than 50 monitoring stations
