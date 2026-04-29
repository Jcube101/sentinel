# Sentinel Frontend — Roadmap

## Phase 1 — V1 Dashboard (IN PROGRESS 🔧)

### Infrastructure
- [x] Vite + React + TypeScript scaffold
- [x] Standalone design system (dark #0a0a0f, amber #f97316, Inter/DM Sans)
- [x] MapLibre GL JS + react-map-gl v8 + supercluster
- [x] Supabase client + React Query hooks
- [ ] Render static site deployment
- [ ] Environment variables on Render

### Landing page (/)
- [ ] Hero with live event counts from Supabase
- [ ] "Open Live Map" CTA
- [ ] Data sources attribution
- [ ] Last updated timestamp
- [ ] Footer with GitHub link

### Dashboard (/dashboard)
- [ ] MapLibre GL map centred on India
- [ ] Coloured markers by category
- [ ] Supercluster clustering
- [ ] Category filter toggles
- [ ] Status filter (open/closed/all)
- [ ] Days range selector (7/30/90)
- [ ] Event detail panel (marker click)
- [ ] Stats bar with Recharts
- [ ] Mobile responsive (390px baseline)

## Phase 2 — V2 Enhancements (PLANNED 📋)
- [ ] AQI heatmap overlay
- [ ] Cyclone track lines
- [ ] Historical trend charts (90-day)
- [ ] Tighter India bbox on frontend
- [ ] Custom subdomain (sentinel.job-joseph.com)

## Phase 3 — Future (💡)
- [ ] Alert/notification system
- [ ] Public API documentation page
- [ ] Offline support (PWA)
