# Sentinel Frontend — Roadmap

## Phase 1 — V1 Dashboard (COMPLETE ✅)

### Infrastructure
- [x] Vite + React + TypeScript scaffold
- [x] Standalone design system (dark #0a0a0f, amber #f97316, Inter/DM Sans)
- [x] MapLibre GL JS + react-map-gl v8 + supercluster
- [x] Supabase client + React Query hooks
- [x] Render static site deployment (sentinel-frontend-8hem.onrender.com)
- [x] Environment variables on Render

### Landing page (/)
- [x] Navbar with SENTINEL brand + "View Live Map" CTA
- [x] Hero with live event counts from Supabase (4 stat cards via useNaturalEvents)
- [x] "Open Live Map" CTA button linking to /dashboard
- [x] "How It Works" section (3 cards)
- [x] Data sources section (5 rows, external links)
- [x] Footer with GitHub link + daily refresh note

### Dashboard (/dashboard)
- [x] MapLibre GL map centred on India (dark tiles via OpenFreeMap)
- [x] Coloured markers by category with pulse animation for open events
- [x] Supercluster clustering with zoom-on-click expansion
- [x] Category filter toggles (fire/flood/cyclone/earthquake)
- [x] Status filter (open/closed/all)
- [x] Days range selector (7d/30d/90d)
- [x] Event detail panel (marker click, mobile bottom sheet + desktop side panel)
- [x] Stats bar with category counts
- [x] Mobile responsive (scrollable filter bar, bottom sheet detail panel)
- [x] Map loading overlay (isLoading prop)

### V1 Cleanup
- [x] Page title + meta description + Open Graph tags
- [x] Custom favicon (fire emoji on dark rect)
- [x] Per-category stat counts on landing page (4 separate queries)
- [x] Per-category query limits (fire 2000, earthquake 1000, flood/cyclone 500)

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
