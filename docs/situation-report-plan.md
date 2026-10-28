# Sentinel — "Situation Report" frontend (Phase 7): plan

Status: **plan updated 28 Oct 2026 with Job's answers; step 1 in progress.** Branch
`frontend/situation-report`, worktree `../sentinel-situation-report`. Design reference:
`docs/design/` (DeskSeverity, DeskQuiet, DeskPhone, MapView, ItemFire), read as visual and
copy spec, not code. Data model: `docs/severity-pipeline.md` and
`pipeline/migrations/001-006`. Everything below was checked against live data (editions
1-25) with read-only anon-key requests.

## 0. Setup and ground rules

- **Design files:** `docs/design/` (commit d1a768b). The mockups' map image points at
  `docs/design/map-news.svg` (Job is adding the file). No screenshots.
- **Preview on the Pi, not on Render.** `npm run build`, then `vite preview` bound to the
  LAN (`--host 0.0.0.0 --port 4173`), opened from Job's laptop at `http://<pi-lan-ip>:4173`.
  The live site deploys from `main` and stays as it is until Job approves the switch; the
  switch is a fast-forward merge of this branch into `main`.
- **Read-only.** The site uses the anon key and only selects. No changes under `pipeline/`
  in this worktree, and nothing here runs the pipeline. Pipeline changes this phase needs
  (section 7) go to the pipeline session.
- Frontend dependencies stay in `frontend/`. The worktree's `frontend/.env.local`
  (gitignored) is a symlink to the main checkout's.

## 1. Pages, routes and what each reads

The front page is a newspaper archive: every edition stays readable as it was published.

| Page | Route | Reads |
|---|---|---|
| Desk | `/` (latest edition), `/edition/:n` (any edition) | `pipeline_runs` row n (number, start time, status, per-source `sources` jsonb). `desk_item_snapshots` of run n with `desk_items` embedded (title, place, lat/lon, source; one request, tested). Snapshots of the runs in the 24 h up to n ("since yesterday") and of runs up to n (14-day strip, days since Level 3+, recently closed, on-the-desk-since). `category_status` of run n. `desk_watch` (latest edition only, until P2). `fire_events` for the mini map. |
| Date | `/date/YYYY-MM-DD` | That IST day's 20:30 edition, shown as on `/edition/:n`, with links to the day's other editions (rules in section 2). |
| Map | `/map` | The latest edition's items. `fire_events` (complete day, plus today marked partial). `fire_state_daily` + `fire_baseline` (vs-norm mode). Closed `desk_items` ("incl. closed"). Snapshots of the last 21 runs (edition strip: highest level per run). `aqi_readings` for an optional OpenAQ station layer, off by default. |
| Item | `/item/:category/:ref` (id = `category:ref`, e.g. `/item/fire/madhya-pradesh`) | The `desk_items` row and all its snapshots (history, chart). Its `desk_watch` row. Fire: `fire_state_daily`, `fire_district_daily` (14 days), the state's `fire_baseline` weeks, `fire_events` for the locator map; older days from snapshot figures. Source links from figures (`gdacs_url`) or the USGS id, not from `events`. The edition's other items (Also on the desk, previous/next). |
| Archive | `/archive` | One row per IST day: the day's `/date` edition, its top item and level, and the day's highest level over all its editions. From `pipeline_runs` (every edition) and the open snapshots of those editions. Also closed items (`desk_items` closed, peak level, opened and closed). |
| Sources | `/sources` | `sources` (freshness columns). `pipeline_runs.sources` for the last ~21 runs (a per-source status grid: status, rows, duration, error). `category_status` (which categories are last-known and why). |
| About | `/about` | Nothing (static text). The thresholds table reads the edition's stored scale once P3 lands. |

How the pages work:

- **An edition is read from its snapshots, not from `desk_items`.** A run writes its
  stages one after another over 5-11 minutes, so `desk_items` can be half-updated during a
  run; a finished run's snapshots can't. The latest edition and past editions use the same
  code. If a stage crashed in that run (no snapshots for its category), the latest edition
  falls back to that category's open `desk_items` rows, shown as last-known.
- **Latest edition** = the newest `pipeline_runs` row that isn't `running`. A failed
  edition is still shown, with what failed (from `pipeline_runs.sources`).
- **Ranking:** level, then strength (fire `ratio_to_norm`, quake magnitude), then title:
  the same order as `watch.py` (`category_status`). Never by count.
- **Level 1 quakes are grouped** into one desk row ("2 small earthquakes, the largest
  M4.6 …"); a quake at Level 2+ keeps its own row.
- **Quiet mode:** when nothing open is above Level 1, the Desk switches to the DeskQuiet
  layout (same route).
- **Phone:** same routes, bottom nav Desk / Map / Archive / Sources (About in the footer),
  "The wire" accordions at the end of the Desk.
- **Old routes:** `/dashboard` → `/map`; `/insights` → `/archive` (Insights is dropped);
  `/event/:id` → the desk item whose `source_ref` is that id, else `/map`.
- All times in IST. The schedule is fixed (02:30, 14:30, 20:30 IST).

## 2. The archive: past editions as published

### Rules

- **`/edition/:n` reads only what existed at edition n:** run n's snapshots and
  `category_status`, snapshots and runs up to n, and `pipeline_runs.sources` of run n.
  Never the "now" tables or views (`sources`, `desk_daily_max`, `desk_last_level3`,
  `category_status_latest`, `desk_watch`), which describe the present. The one exception,
  until P1 lands: titles and places come from `desk_items`.
- **`/date/YYYY-MM-DD`** shows the day's 20:30 edition: the first edition that started
  between 20:30 and 23:59 IST that day (the scheduled evening run, even if it ran late).
  If there is none (today before 20:30, or a missed run), it shows the day's latest
  edition and says so ("No 20:30 edition on this day; this is the 14:30"). A day without
  any edition says so and links to the nearest days. The page links to the day's other
  editions, manual runs included.
- **Archive** lists IST days, newest first: the date, the edition `/date` shows, that
  edition's top item (ranked as on the Desk) and the day's highest level. A month at a
  time once the list grows.
- Edition 1 (20 Oct, 23:20 IST) ran before the desk existed (merged 23:54 IST); its page
  says the desk starts with edition 2. Editions 9 and 10 were manual runs (23 Oct, 11:16
  and 11:30 IST); 10 failed. Both are listed.

### Can every Desk element be rebuilt for a past edition?

| Desk element | Rebuilt for edition n from | Exact? |
|---|---|---|
| Masthead: number, date, run time, run status | `pipeline_runs` row n | Yes |
| Items: level, reason, labels (last-known, air, cap), figures | Snapshots of run n | Yes |
| Item titles | `desk_items` (current). Fire and air titles change between runs; rebuilt from snapshot figures (fire `district_count`, air bands and cities, quake magnitude) | Close. Exact needs P1 |
| Item place and lat/lon (map markers) | `desk_items` (current). Fire centroids move every day; air has none | No. Needs P1 |
| New / escalated / closed tags and counts, Since yesterday | Snapshots of the runs in the 24 h up to n | Yes |
| On the desk since, peak level | Snapshots up to n (latest `opened`/`reopened`, highest level since) | Yes |
| Headline and summaries | Templates over the rows above | As exact as their inputs |
| Level counts | Snapshots of run n | Yes |
| How levels are set | Static copy until P3. The level thresholds haven't changed since the desk started: quake, GDACS and air rules since edition 2, fire since edition 3 (fire items started then, with the current 25 / 2× / 4× and cap 2, merged 21 Oct 12:19 IST) | Yes for editions 2-25, while `severity.toml`'s level rules stay as they are. A change before P3 lands adds a version to the copy, keyed by its first edition |
| Edition banner (late sources) and footer freshness | `pipeline_runs.sources` and `category_status` of run n (not the `sources` table, which is current only) | Yes |
| All-clear table | `category_status` of run n | Yes |
| Watching list | `desk_watch` holds current state only, and rows not updated for 14 days are deleted. Its `trend` keeps the last 10 source updates, but not whether a subject was watching, or why, at each run | No. Needs P2 |
| 14-day strip | Snapshots of runs up to n over the 14 IST days before n (not `desk_daily_max`, which counts later runs on n's day) | Yes |
| Days since Level 3+ | Snapshots up to n with level ≥ 3 (not `desk_last_level3`, which is "now") | Yes |
| Recently closed | Snapshots up to n with `change = closed` | Yes (titles as above) |
| Mini map: fire activity | `fire_events`, kept 14 days; today's and yesterday's rows are rebuilt by later runs | No for editions older than 14 days. Needs P4. The fire items' district lists survive in snapshot figures |
| Phone wire: fires by district, worst air, earthquakes, source desk | Snapshot figures and `pipeline_runs.sources` of run n | Yes |

### Retention check

- **Nothing deletes what the archive needs.** Every delete in `pipeline/`: `events`
  (FIRMS/GDACS after 60 days, EONET/USGS after 365), `aqi_readings` (7 days), `fire_events`
  (14 days), `desk_watch` (rows not updated for 14 days). `pipeline_runs`, `desk_items`,
  `desk_item_snapshots`, `category_status` and `fire_baseline` are never deleted.
  `archive.py` copies only `events` and `aqi_readings` to SQLite.
- **Cascades:** deleting a `pipeline_runs` row deletes that edition's snapshots and
  `category_status` rows (`on delete cascade`); deleting a `desk_items` row deletes all its
  snapshots. Nothing does either today. Rule for manual clean-ups: never delete editions or
  desk items.
- **Not kept, so the site doesn't depend on them:** `events` rows behind quake and GDACS
  items (links come from figures and ids instead); `fire_events` beyond 14 days (P4);
  `desk_watch` history (P2).
- **Size:** snapshots run ~22 KB per edition (the air item ~11.7 KB, fire ~3.6 KB per
  state), about 24 MB a year.

## 3. Gaps

### A. In the designs, not supported by the data (yet)

1. **Thresholds aren't in the data.** The pipeline will store the scale per edition (P3).
   Until it lands, the site uses a copy (`frontend/src/lib/scale.ts`). The mockups'
   thresholds are out of date: fire is 2× / 4× with at least 25 fire events and a cap at
   Level 2 (mockup: 1.25× / 2×); the baseline is 2024–2025 (mockup: 2023–25); air uses CPCB
   AQI bands, Poor above 200, Very poor above 300, Severe above 400.
2. **Editorial prose.** The headlines and paragraphs are hand-written ("Landfall expected
   between Gopalpur and Paradip", "All fires are low-intensity and on farmland"). The data
   has plain titles ("Fire activity in 26 Madhya Pradesh districts") and reasons. Plan:
   per-category templates that build the headline and summary from figures, and no
   forecasts, land-cover or cause claims the data can't back.
3. **Cyclones:** no track, distance from the coast or landfall forecast (GDACS publishes a
   track; the pipeline doesn't store it). Wind speed is in the figures but not the reason
   (section 7).
4. **Air:** no station names and no µg/m³ values (the feed gives AQI sub-indices; figures
   keep each city's AQI, band, prominent pollutant and station count). Air cities have no
   coordinates, so the map can't place "Mumbai air · 712" (P5). "4 of 52 stations" becomes
   "1 of N cities very poor, 16 poor", from `counts` and `cities_reporting`.
5. **Fire:**
   - No norm per district ("vs norm" column, "districts active · norm 9"): the baseline is
     per state. The districts table shows counts and the change from the day before.
   - "High-intensity fires" has no threshold except the Level 4 rule; show
     `large_fires_near_people` instead.
   - Raw hotspots before filtering ("1,404 of 2,147") aren't stored; the count funnel
     starts at the hotspots kept.
   - The "last 21 runs" chart: fire levels move once per complete UTC day (a day's three
     runs repeat). Chart by day instead: 14 days from `fire_state_daily`, longer from
     snapshot figures (one point per `figures.day`).
   - Punjab + Haryana as one item: the data has one item per state (5 fire items at
     Level 2 in edition 25).
6. **The all-clear table** shows "Floods & cyclones" as one row and an "Other events ·
   EONET" row. `category_status` has flood and cyclone separately and no EONET (EONET
   isn't on the desk). Plan: five rows; EONET appears only on the Sources page.
7. **"On the desk since":** `opened_at` keeps the first opening when an item reopens. Use
   the item's latest `opened` / `reopened` snapshot.
8. **Closing reasons** ("fell to norm", "very poor ended") aren't stored. Recently closed
   shows title, peak level and how long it was open.
9. **Copy that is wrong in the mockups:** refresh times are 02:30 / 14:30 / 20:30 IST
   (mockup: 06:00 / 14:00 / 22:00); edition numbers are around 25 (mockup: 293); the air
   item's primary source is CPCB via data.gov.in (mockup: OpenAQ).
10. **No mockups for Archive, Date, Sources or About.** They are built from the same parts
    (masthead, rules, mono labels, tables).
11. Past editions: see section 2 (P1, P2, P4).

### B. In the data, not used by the designs

- `deescalated` and `reopened` changes (the designs show only new, escalated and closed),
  and peak level ("peaked at Level 3, now 2").
- `figures.today`: today's partial fire count.
- `firms_level` and `large_fires_near_people`: what the calibration cap holds back.
- GDACS wildfire alerts per state (the forest-fire trigger for Level 3).
- Quakes: depth, distance from India, tsunami flag, felt reports, USGS PAGER alert.
- GDACS: alert-score trend, the event's peak vs the current episode, `ends_at`, the GDACS
  report link.
- `desk_watch` for every subject (41 rows), not only those watching: how close each state
  is to its next level. Fits the fire item page or the map's vs-norm mode.
- `pipeline_runs.sources`: per-run status, rows and duration for each source, and the
  run's own status. For the Sources page, and for the masthead when a run failed.
- `sources.newest_observation_at` vs `last_success_at`: tells "fetched fine, nothing new"
  (a quiet USGS) apart from "fetch failed".
- Air: every Poor-or-worse city with its state and prominent pollutant,
  `severe_unconfirmed`, and the `method` text.
- `fire_baseline`'s `India` row: the national fire ratio (the quiet mockup uses this; it
  can be derived).
- EONET events and the raw `events` table: not on the desk.

## 4. Order of work

Each step is a commit on the branch: `npm run build`, lint and tests pass, and it is
checked on the Pi preview against live data. Smallest shippable step first.

0. **Setup.** Worktree and branch: done. Mockups point at `map-news.svg`.
1. **Desk v0, and `/edition/:n` with it** (same code). Paper palette tokens and IBM Plex
   fonts; masthead, nav, edition line with previous/next edition, footer with the
   edition's source status; typed hooks for `pipeline_runs` and an edition's snapshots
   with embedded items and its `category_status`; `lib/levels.ts` (level names, ranking,
   reason splitting, Level 1 quake grouping). The edition's items ranked by level, each
   with level, category, title, reason and the last-known, air and cap labels; the late
   sources banner. Phone layout from the start. Vitest for the pure functions. Other nav
   links show placeholders; old pages stay in the tree, unrouted, until step 9.
2. **Desk, severity day.** Level counts; new, escalated and closed counts; the headline
   template; Since yesterday; per-category cards (fire figures strip, quake, GDACS, air);
   the "How levels are set" panel (`lib/scale.ts`); the phone wire.
3. **Desk, quiet day.** Watching list (latest edition only until P2), all-clear table,
   14-day strip and days since Level 3+ (both from snapshots, so past editions work),
   recently closed.
4. **About.** Levels, the cap, the air labels, the schedule, the not-an-alert-system
   disclaimer and the credits (clears the spec's TODO). Small and static.
5. **Item page.** Generic parts first (header, reason, labels, history from snapshots,
   also on the desk, previous/next, permalink); then fire (districts, daily chart vs norm,
   count funnel, locator map); then air, quake, cyclone and flood.
6. **Map.** Paper basemap (Esri World Light Gray Canvas, keyless, same `{z}/{y}/{x}` order
   as today's tiles, warmed with a CSS filter); desk items as numbered markers; side list;
   level and open/closed filters; fire modes (fires: `fire_events` clustered with the
   existing Supercluster code; activity: a grid; vs norm: a state map, which needs a
   simplified state-outline file in `frontend/public`, credited); the edition strip. The
   Desk's map image becomes a small non-interactive map.
7. **Sources page.** Freshness table, per-run status grid, which categories depend on
   which source.
8. **Archive and Date.** `/date/YYYY-MM-DD` with the day's other editions; the Archive's
   list of days with each day's top item; closed items.
9. **Switch-over prep.** Redirects for old routes (`/insights` → `/archive`, `/event/:id`,
   `/dashboard`); remove the old pages, components and unused dependencies (Recharts if
   nothing uses it); meta tags and favicon; accessibility and phone pass. Job reviews the
   preview and approves; fast-forward merge into `main`; Render deploys. Update `CLAUDE.md`
   (Frontend), `frontend/README.md` and both roadmaps.

## 5. Labels: last-known, air, fire cap

### Last-known items
From: `last_known` on snapshots; `category_status.last_known` and `source_status`; the
reason's ` · last known: <why>` suffix; per-source status in `pipeline_runs.sources`.

- The item keeps its level and rank (it is still the best information there is), with a
  line in the accent colour: "LAST-KNOWN · <why>". The item page adds "figures from
  <time>": its latest snapshot with `last_known = false`.
- The shown reason is the text before the first ` · `, since the pipeline appends notes
  with ` · ` (last known, cap, unconfirmed Severe). Each note shows as its label, not twice.
- An edition banner (the phone mockup's LATE box, on desktop too) when any category is
  last-known or a source's fetch failed in that run, e.g. "GDACS didn't answer in this
  run. Cyclone and flood items are the last known."
- Footer: a source turns accent-coloured when its status in that run isn't `ok`. Dense
  sources (FIRMS, OpenAQ, data.gov.in) show the age of their newest data at run time;
  event-driven ones (GDACS, EONET, USGS) read "quiet" when their newest data is over a day
  old, since no news is normal for them.
- Map: a dashed marker outline.
- Days since Level 3+: read from the snapshot itself, which carries `last_known`; once
  migration 007 lands the view has it too.

### Air: unvalidated vs approximate
From `figures.source`, `figures.approximate` and `figures.unvalidated`, not by matching
reason text.

- **data.gov.in (source DATAGOV):** label "CPCB REAL-TIME · UNVALIDATED", with the note
  "CPCB's hourly AQI, before CPCB validates it. A city counts as Severe only after 2 runs
  in a row." `severe_unconfirmed` shows as "Severe in X, not yet confirmed".
- **OpenAQ fallback (source OPENAQ):** label "APPROXIMATE", with the note "Sentinel's
  estimate of the CPCB band from 24-hour means of OpenAQ readings, not an official AQI",
  and the date the data runs to (`data_as_of` / `oldest_data`), since fallback data can be
  days old.
- Values always read "AQI 301, very poor", never "official". The item page shows
  `figures.method`. Watching distances are in AQI points (DATAGOV) or µg/m³ (OPENAQ).

### Fire calibration cap
From `figures.capped`, `figures.firms_level` and `figures.calibration_cap`.

- Level squares: filled up to the shown level, dashed up to `firms_level`. Label "CAPPED AT
  L2 · WOULD BE L3".
- The shown reason drops the ` · capped at …` suffix (the label says it).
- Ranking and the headline use the shown level; ties go to the higher `ratio_to_norm`.
- The "How levels are set" fire row and About: "Fire levels from satellite counts stop at
  Level 2 until live counts are checked against the archive. A GDACS forest-fire alert can
  still lift a state to Level 3." Shown while the cap is below 4.
- Item page: what the cap holds back (`firms_level`, and `large_fires_near_people` when the
  Level 4 rule fired).

## 6. Follow-ups already in the spec

| Follow-up | Who | Frontend handling |
|---|---|---|
| Wind speed in the cyclone reason ("GDACS Red alert, 222 km/h winds"). The speed is already in `figures.severity` / `severity_unit` / `severity_text`. | Pipeline session (`desk.gdacs_candidates`); no migration | Cards and the item page read wind speed from the figures, so the frontend doesn't wait. Once the reason has it, don't show it twice. |
| `last_known` in `desk_last_level3` | Pipeline session writes migration 007 (add `s.last_known` to the view, same grants); Job applies it | The archive reads snapshots directly (section 2), which carry `last_known`, so the site doesn't wait |
| About-page credits: geoBoundaries (ODbL 1.0), DataMeet / ECI state boundaries (CC BY 2.5 IN), GeoNames (CC BY 4.0), CPCB via data.gov.in (Government Open Data License - India); the FIRMS acknowledgement covers the baseline and the mask | Frontend, step 4 | Alongside the existing credits (NASA FIRMS, NASA EONET, GDACS, USGS, OpenAQ), the Esri basemap, and the state-outline file if step 6 adds one |

## 7. For the pipeline session

Needed so past editions can be shown exactly as published (section 2):

- **P1. Title, place and location per run:** `title`, `place_name`, `latitude`,
  `longitude` on `desk_item_snapshots` (a migration; nullable, older rows stay null). Air
  and fire titles change between runs, and fire centroids move every day.
- **P2. The watching list per run:** a per-run copy of `desk_watch` (e.g.
  `desk_watch_snapshots`: run_id, id, category, title, item_id, level, next_level, metric,
  value, next_threshold, distance_to_threshold, rising_updates, watching, watch_reason),
  for every subject (~41 rows a run) or at least those watching.
- **P3. The scale per edition** (decided): the level thresholds each edition ran with.
- **P4. Fire activity for maps older than 14 days:** a per-district daily roll-up (count,
  centroid, max FRP) kept indefinitely, or a longer `fire_events` retention.

Also:
- **P5.** Lat/lon per city in the air figures (the feed has station coordinates; no
  migration).
- The air all-clear line always says "approx. CPCB band", even when data.gov.in set the
  level (`watch.all_clear`).
- Grants on `sources`, `events`, `aqi_readings` (already a follow-up): fix before the new
  site goes live, since it is public and uses the anon key.
- Never delete `pipeline_runs` or `desk_items` rows by hand: the cascades take editions'
  snapshots and status with them.

## Decisions (Job, 28 Oct 2026)

1. Preview locally: `vite preview` on the Pi, bound to the LAN. No second Render site.
2. Insights is dropped; `/insights` redirects to `/archive`.
3. Level 1 quakes are grouped into one desk row.
4. Thresholds: the pipeline will store them per edition (handed to the pipeline session);
   until then the site uses a copy.
5. Design files are the ones in `docs/design/` (d1a768b); the mockups' map image points at
   `map-news.svg`. No screenshots.
6. New: the front page is a newspaper archive (`/edition/:n`, `/date/YYYY-MM-DD`,
   Archive by day), section 2.
