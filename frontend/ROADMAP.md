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

## Phase 4 — UI / IA Revamp (COMPLETE ✅)

A fresh look + real information architecture. India-scoped. No pipeline or
schema changes — everything below is derivable from the existing `events` and
`aqi_readings` tables. Strategy notes live in the gitignored `REVAMP.md` at repo
root; this section is the self-contained execution spec.

**Ground rules for the implementer**
- Stay India-scoped. Do not add global/region-switching UI.
- Do NOT add light mode or an alerts/subscribe page — both are parked in
  Phase 5. Tokenize colors anyway (step 4.1) so light mode is cheap later.
- Reuse existing hooks (`useNaturalEvents`, `useAqiReadings`) and types. Do not
  change the Supabase query shape.
- Ship steps 4.1–4.3 first; they deliver the "fresh look." 4.4–4.6 are additive.

### 4.1 — Foundation: design tokens + helpers (do first, no visible change)
- [x] Add CSS custom properties to `src/index.css` `:root`, sourced from the
      values currently hardcoded across components:
      `--bg:#0a0a0f`, `--surface:#16161f`, `--surface-2:#111118`,
      `--border:#2a2a3a`, `--text:#f0f0f5`, `--muted:#7070a0`,
      `--accent:#f97316`, `--accent-hover:#ea6a0a`.
      Category hues: `--cat-fire:#ef4444`, `--cat-flood:#3b82f6`,
      `--cat-cyclone:#8b5cf6`, `--cat-earthquake:#f59e0b`.
      Severity ramp (distinct from category hues): `--sev-low:#22c55e`,
      `--sev-mid:#f59e0b`, `--sev-high:#ef4444`.
- [x] Extend `tailwind.config` `theme.extend.colors` to alias these tokens
      (e.g. `bg`, `surface`, `border`, `muted`, `accent`) so components use
      Tailwind classes instead of inline `style={{ ... }}` hex.
- [x] Migrate existing components off inline hex to the tokens/classes as they
      are touched in later steps (no big-bang rewrite required; opportunistic).
- [x] Replace ad-hoc `onMouseEnter/onMouseLeave` hover hacks (Navbar, Landing
      CTA, data-source rows) with CSS `:hover` once tokens exist.
- [x] New `src/lib/time.ts` — `relativeTime(iso: string): string` returning
      "just now" / "4h ago" / "2d ago", and keep the existing absolute
      `formatDate` (move the one from EventDetailPanel here so it's shared).
- [x] New `src/lib/severity.ts` — `severityScore(event): number` (0–100) to
      allow cross-category ranking:
      - earthquake: map magnitude `severity_value` M3→0, M8→100 (clamp).
      - fire: FIRMS confidence/brightness bucket → low/mid/high → 33/66/100
        (fallback 50 if null).
      - flood/cyclone (GDACS): parse alert level from `severity`/`severity_value`
        (green/orange/red → 33/66/100).
      - Blend with recency: `score = 0.75*base + 0.25*recencyBoost` where
        recencyBoost decays over the last 72h. Keep weights as named consts so
        they are tunable. Also export `severityBucket(score): 'low'|'mid'|'high'`
        mapped to the `--sev-*` ramp.

      Implementation note: every fetcher already normalizes a `severity`
      label (low/medium/high/extreme) onto each row, so the base score
      buckets that shared label (25/50/75/100) for all categories except
      earthquake, which uses the magnitude formula above since it's more
      precise than the label. Also exports `SEVERITY_COLORS` (hex) for
      components that need a translucent chip background — Tailwind can't
      apply opacity modifiers to colors sourced from CSS variables.

### 4.2 — Router + app shell
- [x] Routes (react-router-dom, already used): `/` Home, `/map` Live Map,
      `/insights` Insights, `/event/:id` Event detail, `/about` About. Add a
      redirect `/dashboard` → `/map` so existing links/bookmarks survive.
- [x] Rework `Navbar.tsx` into real navigation: brand + links (Map, Insights,
      About) with an active-route style, keeping the amber "View Live Map" CTA.
      Collapse to a simple menu on mobile.
- [x] Rename the page component `pages/Dashboard.tsx` → `pages/LiveMap.tsx`
      (keep internals) and wire it to `/map`. Update `App.tsx` routes.

### 4.3 — Landing / Home (`/`) revamp
- [x] Compact hero to ~70vh (from 100vh). Keep eyebrow + headline; replace the
      subhead's "five public APIs / WebGL" copy (stale — we use 4 event sources
      + Leaflet) with accurate copy.
- [x] Replace the 4 plain count tiles with a **live status line**: "Tracking _N_
      active events across India from 4 official sources — updated 3× daily,"
      where N is the sum of the four `useNaturalEvents({status:'open'})` counts
      already fetched here.
- [x] Two CTAs: **View Live Map** (primary → `/map`) + **Explore Insights**
      (secondary → `/insights`).
- [x] **Active Threats feed** (headline feature): new `components/ui/ThreatFeed.tsx`.
      Take all open events from the 4 hooks, rank by `severityScore` desc, take
      top 6–8. Each row: category emoji · `title` · `place_name` · relativeTime ·
      a severity chip colored by `severityBucket`. Whole row links to
      `/event/:id`. Loading skeleton mirrors the existing hero skeleton pattern.
- [x] **Category strip** with live counts — fire/flood/cyclone/earthquake + AQI
      station count — each links into `/map` pre-filtered (pass category via
      query param or router state; LiveMap reads it into initial `filters`).
- [x] **Inline mini-map preview**: a small non-interactive (or `dragging`/`zoom`
      disabled) `SentinelMap` instance with a "Open full map →" overlay linking
      to `/map`.
- [x] Keep "How It Works" (tighten copy) and restyle "Data Sources" as a badge
      grid. Add a **responsible-use disclaimer** block: "Sentinel is not an
      official emergency alert system — for emergencies contact local
      authorities (NDMA / 112)."
- [x] Move the About/methodology-heavy content to `/about`; Home links to it.

### 4.4 — Event detail page (`/event/:id`)
- [x] New `pages/EventDetail.tsx` at `/event/:id`. Fetch a single event by id
      (new tiny hook `useEvent(id)` querying `events` by `id`, or reuse cached
      list). Render everything `EventDetailPanel` shows plus: relative-time line,
      severity meter bar (from `severityScore`), a small locator `SentinelMap`
      centered on the event, and a "Nearby events" list (client-side: events
      within ~1° box, sorted by distance).
- [x] Add a "View full page →" link inside `EventDetailPanel.tsx` (map panel)
      pointing to `/event/:id`, plus the relative-time line and severity meter
      so the panel and page stay consistent.

### 4.5 — Insights page (`/insights`)
- [x] New `pages/Insights.tsx`. No map. Use Recharts (already a dependency).
      All charts derive from the existing hooks over a 90d window.
- [x] Events-by-category over time — stacked area/bar bucketed by day from
      `started_at`.
- [x] Severity distribution — histogram of `severity_value`, **faceted per
      category** (units differ: magnitude vs confidence vs alert level).
- [x] Most-affected regions — top `place_name`/`city` by event count.
- [x] Open-vs-closed ratio + median duration (`closed_at − started_at`).
- [x] AQI leaderboard — worst current PM2.5 stations ranked, with parameter
      breakdown, from `useAqiReadings`.
- [x] Follow the `dataviz` skill's palette/legend/axis guidance; reuse the
      severity ramp + category tokens so charts match the app.

      Implementation note: the severity histogram buckets by the shared
      normalized `severity` label (low/medium/high/extreme) rather than raw
      `severity_value`, since that field's units are genuinely incompatible
      even within one category (USGS magnitude vs. GDACS alert-level numerics
      for earthquakes). "Most-affected regions" excludes events with no
      `place_name` (mostly raw FIRMS hotspots) rather than lumping them into
      an "Unknown" bucket that would dwarf every real place. The app's
      existing category palette (fire/flood/cyclone/earthquake) does not
      pass the dataviz skill's CVD-safety validator (cyclone↔flood ΔE 1.3
      deutan) — kept anyway per the ground rule to match existing app tokens;
      every chart using it carries a visible legend or facet title so
      category is never color-only.

### 4.6 — Live Map polish
- [x] `FilterBar.tsx`: group into labeled segments (Category | Status | Window |
      AQI) with small group labels; add a "clear filters" affordance; make the
      `N events` count more prominent. Accept an initial-category prop/param from
      the Home category strip.
- [x] Persistent category-color **legend** on the map.
- [x] `EventDetailPanel.tsx`: relative-time line, severity meter, "View full
      page →" link (shared with 4.4).
- [x] `StatsBar.tsx`: add worst-AQI reading and a clearer "last updated" line.
- [x] Map loading/empty skeletons consistent with Landing.
- [x] Optional: command-palette (Ctrl-K) search over event titles/places →
      `/event/:id`. Nice-to-have; land last.

      Implementation note: the search icon button in `FilterBar` opens the
      same palette as Ctrl-K (state lifted to `LiveMap.tsx` so both triggers
      share it) — a text hint next to the event count made the bar overflow
      at common desktop widths and hid the count, so it became an icon
      button instead.

## Phase 5 — Future (💡)
- [ ] Light mode (tokens already in place from Phase 4.1 — flip via a
      `[data-theme]` override + toggle)
- [ ] Alert / subscribe page (notification opt-in)
- [ ] Public API documentation page
- [ ] Offline support (PWA)
