# Sentinel — "Situation Report" frontend (Phase 7): plan

Status: **live since 29 Oct 2026, 22:30 IST: `main` fast-forwarded to `frontend/situation-report` (ff13f0e) and deployed on Render; checked live on every page type, with P1 and P2 on editions 29 and 30. Steps 1 to 9 done; P1-P7 used by the site (see "Used by the frontend" under section 7; P5-P7 and the map page's collapsed key from 30 Oct). The copy follows `docs/style-guide.md`; caveats sit in source lines and Notes; map symbols follow `docs/design/MapSymbols.dc.html` (decisions 11–13).** Built on branch
`frontend/situation-report` (merged; its worktree is removed). Design reference:
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
  code. If a stage crashed in that run (`category_status` counts more open items than the
  run has snapshots of), the edition shows that category's items from their latest earlier
  snapshot, marked last-known ("figures from No. m"). Not seen in editions 1-25.
- **Latest edition** = the newest `pipeline_runs` row that isn't `running`. A failed
  edition is still shown, with what failed (from `pipeline_runs.sources`).
- **Ranking:** level; then, at the same level, category in a fixed order (cyclone, flood,
  earthquake, air, fire: Job, 28 Oct); then strength within the category (fire
  `ratio_to_norm`, quake magnitude), then title. Within a category this is the order
  `watch.py` ranks in (`category_status`). Never by count.
- **Copy:** every generated line follows `docs/style-guide.md` (templates in
  `lib/desk/copy.ts`, tests in `copy.test.ts`). Built only from the edition's own data,
  with dates relative to the edition, so the archive reads as published.
- **Since yesterday** compares the edition with the latest edition that started at least
  23 hours before it (the same slot a day earlier, with an hour's slack for late runs). An
  item is new or reopened if it opened or reopened after that edition; escalated or
  de-escalated if its level now differs from its level then (the net change, so down and
  back up is no change); closed if it closed after that edition and isn't open now. The
  items' change tags, the counts under the level boxes and the headline all use this, not
  the run's own `change`.
- **Level 1 quakes are grouped** into one desk row ("Two small earthquakes strike near
  India's borders"); a quake at Level 2+ keeps its own row.
- **Fire states are one roundup row,** ranked at the highest state's level (Job, 28 Oct).
  A state gets its own row at Level 3+, or when it is the only fire state. Title angles
  and copy: `docs/style-guide.md`, *Fire roundup*.
- **Legend:** "How levels are set" is a collapsed section at the foot of every page, with
  the full explanation on About. The Desk's sidebar holds the map (a placeholder until
  step 6) and Since yesterday.
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
| Item titles | Snapshot `title` from edition 29 (P1). Before: `desk_items` (current); fire and air titles change between runs, so they are rebuilt from snapshot figures (fire `district_count`, air bands and cities, quake magnitude) | Yes from 29; close before |
| Item place and lat/lon (map markers) | Snapshot `place_name`, `latitude`, `longitude` from edition 29 (P1). Before: `desk_items` (current), only when no later run moved the item; air has none | Yes from 29; partly before |
| New / escalated / closed tags and counts, Since yesterday | Snapshots of the runs in the 24 h up to n | Yes |
| On the desk since, peak level | Snapshots up to n (latest `opened`/`reopened`, highest level since) | Yes |
| Headline and summaries | Templates over the rows above | As exact as their inputs |
| Level counts | Snapshots of run n | Yes |
| How levels are set | `pipeline_runs.severity_config` of run n (P3; 1-28 backfilled). Fire rules were 1.25× / 2×, 10 fires, no cap in editions 1-2 (no fire items yet); air had no AQI bands and no two-reports rule for severe before edition 9 | Yes |
| Edition banner (late sources) and footer freshness | `pipeline_runs.sources` and `category_status` of run n (not the `sources` table, which is current only) | Yes |
| All-clear table | `category_status` of run n | Yes |
| Watching list | `desk_watch_snapshots` of run n from edition 29 (P2); the trend is the subject's values in the runs before. Editions 1-28: `desk_watch` (current state) for the latest edition only | Yes from 29; none before |
| 14-day strip | Snapshots of runs up to n over the 14 IST days before n (not `desk_daily_max`, which counts later runs on n's day) | Yes |
| Days since Level 3+ | Snapshots up to n with level ≥ 3 (not `desk_last_level3`, which is "now") | Yes |
| Recently closed | Snapshots up to n with `change = closed` | Yes (titles as above) |
| Mini map: fire activity | `fire_day_points` (P4, from 19 Oct): the fire items' `figures.day`, points first seen by `figures.data_to`. A day not there falls back to `fire_events` (14 days) | Yes (district names aren't in the points, so dot tooltips name the state only) |
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
   the "How levels are set" panel (`lib/scale.ts`); the phone wire. **Done.** Notes:
   - Headline: the top item ("… is the most severe item on the desk", or "Six items lead
     the desk at Level 2: …" with same-category items counted together), then one change
     sentence (new, else escalated, else eased or closed, else "No change since
     yesterday"). Templates only.
   - Figures strip under every Level 2+ item, three cells on phones. Fire: districts, fire
     events, ratio to norm, large fires near towns (in place of the mockup's
     "high-intensity"), plus the norm, the baseline's busiest day and the three busiest
     districts. Air: cities severe / very poor / poor / reporting and the worst three.
     Quake: magnitude, depth, distance from India, felt reports, PAGER alert, USGS link.
     Cyclone and flood: GDACS alert, wind speed, alert score, episode, GDACS link.
   - The sidebar's map image waits for step 6 (the map).
   - **2b, the copy (Job, 28 Oct):** step 3 paused to rewrite every generated line as news
     for ordinary readers: `docs/style-guide.md` first, then titles with verbs,
     standfirsts, the page headline, Since yesterday, the late notice and the wire. The
     exact figures stay, set smaller, as evidence under each story.
   - **2c (Job, 28 Oct):** the fire roundup (one story for the fire states, a state table
     under it, no multiples in titles); the legend moved to the footer and About.
   - **2d (Job, 28 Oct):** easing angle; state table only for states still at Level 2+;
     grouped Since yesterday lines; cyclone location from geometry (`lib/desk/where.ts`,
     coast and outline in `lib/desk/geo/india-coast.json`, derived from pipeline/data);
     no alert score or episode in the strip; footer ages labelled; no self-reference in
     any copy (style guide).
3. **Desk, quiet day.** Watching list (latest edition only until P2), all-clear table,
   14-day strip and days since Level 3+ (both from snapshots, so past editions work),
   recently closed. **Done.** Notes:
   - The Desk switches to it when nothing open is above Level 1. No edition so far has
     been quiet (every run from No. 2 to 26 had a Level 2+ item), so it was checked with
     unit tests on real history and in the browser with the replies trimmed to Level 1.
   - Everything reads runs and snapshots up to the edition (`useDeskHistory`), except the
     watching list: on a past quiet edition it says the list is kept for the latest
     report only (P2).
   - "A quiet day, the third in a row" counts IST days with nothing above Level 1; a day
     without an edition ends the count.
   - Recently closed: the last five, each with its closing day, peak level and days on
     the list since its latest opening (closing reasons aren't stored, gap A8).
4. **About.** Levels, the cap, the air labels, the schedule, the not-an-alert-system
   disclaimer and the credits (clears the spec's TODO). Small and static. **Done** with 2c,
   since the full levels explanation moved there. The Esri basemap credit joins with the
   map (step 6). The spec's About TODO (`docs/severity-pipeline.md`) can be ticked when
   this merges.
5. **Item page.** Generic parts first (header, reason, labels, history from snapshots,
   also on the desk, previous/next, permalink); then fire (districts, daily chart vs norm,
   count funnel, locator map); then air, quake, cyclone and flood. **Done.** `/item/:category/:ref`,
   `?edition=n` for an item as of an edition (snapshots up to n). The fire chart takes
   `fire_state_daily` for days before the shown one and the edition's own count for its
   day, so it matches what the edition said; older days come from snapshot figures. The
   fire roundup has no page of its own: its state table links to each state.
6. **Map.** Paper basemap (Esri World Light Gray Canvas, keyless, same `{z}/{y}/{x}` order
   as today's tiles, warmed with a CSS filter); desk items as numbered markers; side list;
   level and open/closed filters; fire modes (fires: `fire_events` clustered with the
   existing Supercluster code; activity: a grid; vs norm: a state map, which needs a
   simplified state-outline file in `frontend/public`, credited); the edition strip. The
   Desk's map image becomes a small non-interactive map. **Done, in part.** `/map`
   (`?edition=n`, `?item=id`): numbered markers by desk row, side list with the selected
   item opened, level and open/incl.-closed filters, layer toggles, the day's fires as
   dots (`fire_events`, about 400–650 a day, drawn on a canvas, so no clustering needed),
   the 21-edition strip; a small still map in the Desk's sidebar and on item pages.
   Not yet: the activity grid and vs-norm state map modes (need a state outline file),
   an OpenAQ station layer. Past editions show no item markers whose position a later
   run moved (P1); fire dots go back 14 days (P4). Leaflet adds about 75 KB gzipped: split
   the map pages into their own chunk in step 9.
7. **Sources page.** Freshness table, per-run status grid, which categories depend on
   which source. **Done.** `/sources` (`?edition=n`), built from each run's own
   `pipeline_runs.sources` and `category_status`, so a past edition shows how its sources
   answered then: each source's answer, newest data, rows and time taken; which part
   reads which source and whether it is up to date or last known; a grid of the last 21
   editions. Raw error text is not shown (it can carry request details); status words
   only. The `sources` table isn't read, so its grants (section 7) no longer block this
   page.
8. **Archive and Date.** `/date/YYYY-MM-DD` with the day's other editions; the Archive's
   list of days with each day's top item; closed items. **Done.** `/date/:day` shows the
   Desk for the day's edition (first run from 20:30 IST, else the day's latest, said in
   the DAY note: "no 20:30 edition yet / on this day"), the day's other editions with
   their slot (manual runs by time) and the days either side; a day without an edition
   says so and links to the nearest. `/archive` (`?month=YYYY-MM`) lists a month's days,
   newest first: the day's highest level over all its editions, the chosen edition's
   lead (ranked and worded by the Desk's own code, with the comparison built from the
   month's slim rows: three reads a month), the edition and how many others ran; then
   the month's closings from the closing snapshots (an item that reopened keeps its
   closing), with peak level and days open. The edition line's date links to its day.
9. **Switch-over prep.** Done on the branch (28 Oct):
   - Old routes: `/insights` → `/archive`, `/dashboard` → `/map`, and `/event/:id` → the
     desk item whose `source_ref` is that event (`useItemForEvent`), else a short note
     linking today's report and the map (fire events and NASA's event tracker never
     became items).
   - The old site is gone: Landing, LiveMap, Insights, EventDetail, the layout, map and
     ui components, `useNaturalEvents` / `useAqiReadings` / `useEvent`, `lib/severity`,
     `lib/time`, `lib/types`, `icons.svg`, the dark tokens and tile filter in `index.css`
     and `tailwind.config.js`, and four packages (lucide-react, recharts, supercluster,
     @types/supercluster). The site now reads only the desk tables (CLAUDE.md, Frontend).
   - Bundles: every page but the Desk loads on first visit, the mini map's Leaflet loads
     after the page's text, and React, Supabase, React Query and Leaflet are chunks of
     their own. The site's own code on the front page fell from ~770 kB in one file to
     123 kB (39 kB gzipped) plus the cached library chunks; no chunk over 500 kB.
   - Meta: title, description and Open Graph tags for the Situation Report; a paper
     favicon (the level squares, the fourth in red); a `<noscript>` line.
   - Accessibility and phone pass: axe (WCAG 2.1 A/AA) clean on every route at 1440 and
     390 px, no horizontal scroll, no console errors; a skip link to the content; one
     focus ring on paper; the map page has a heading; the still maps' markers are no
     longer keyboard stops, and the full map's are buttons named by their item.
   - CLAUDE.md (intro, Structure, Frontend), `frontend/README.md` and both roadmaps
     describe the new site as it will be once merged.
   - **For Job:** review the preview; then fast-forward `main` to this branch and push, and
     Render deploys the site (`render.yaml` runs `npm run build`, without the dev pages).
     The branch changes nothing under `pipeline/`, so the timer's runs are unaffected.

## 5. Labels: last-known, air, fire cap

**Superseded in part by decision 11 (28 Oct):** no labels in the story. Air's
provisional/estimate status and an incomplete fire day are in the item's source line;
last-known is an "As of …" kicker over the title plus "didn't answer this time" in the
source line; the fire cap is the dashed square, explained once in the page's Notes. The
data each one reads, below, is unchanged.

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
  migration). **Requested by Job on 28 Oct** for the map's air layer (decision 12): the
  frontend builds the layer against the field names the pipeline session gives, and keeps
  the "Air has no place on the map yet" placeholder until then. It needs, for each city
  at poor or worse in `figures.cities`, a position (station mean or city centre) and its
  band and reading, as the figures already carry.
- **P7.** A cyclone's current position: GDACS's point (`Class: Point_Centroid`) is the
  centre of the area it maps for the event, not the storm. The latest track point would
  let the copy say where the storm is.
- **P8. Incomplete fire days (found 28 Oct, No. 26):** No. 26 levelled fire on 27 Oct with
  data only to 09:07 UTC (`figures.data_to`); 26 Oct ran to 21:53 UTC. FIRMS had sent
  neither 27 Oct's night pass nor 28 Oct's morning pass by 09:04 UTC (846 rows; newest
  24 h old, so the footer read 23H 58M). Four states fell to Level 1 on that partial day.
  Suggest: treat a UTC day as complete only once it has data after ~18:00 UTC (the night
  pass), else keep the last levels as last-known. Until then the site says the counts are
  incomplete and claims no easing.
- **P6.** Each fire item's national rank by fires that day (e.g. `figures.state_rank`,
  and the number of states with fires), so a title can say "the most fires of any state".
  An edition holds only the states on the desk, so today the copy says "the most fires of
  the five states above normal" (No. 25: Punjab had 53 fires but no item).
- The air all-clear line always says "approx. CPCB band", even when data.gov.in set the
  level (`watch.all_clear`).
- Grants on `sources`, `events`, `aqi_readings` (already a follow-up): fix before the new
  site goes live, since it is public and uses the anon key.
- Never delete `pipeline_runs` or `desk_items` rows by hand: the cascades take editions'
  snapshots and status with them.

### Delivered by the pipeline session

Migration 008 was applied on 29 Oct 2026 (anon reads every new table and column, and
can't write). The code below is on `main`. "From edition n" = the first edition that
writes the field; older rows have it null or missing, so keep the fallbacks for them.

- **P1** (merged 29 Oct, from edition 29): `desk_item_snapshots.title`, `.place_name`,
  `.latitude`, `.longitude`, the item's values as of that run (a last-known or closing
  snapshot keeps the item's last values). Null on editions 1-28: use `desk_items` there,
  as now.
- **P2** (merged 29 Oct, from edition 29): table `desk_watch_snapshots`, primary key
  (`run_id`, `subject_id`), one row per watch subject per run, watching or not (~40 a
  run). Columns: `run_id`, `subject_id` (= `desk_watch.id`), `category`, `title`,
  `item_id`, `level`, `next_level`, `metric`, `value`, `next_threshold`,
  `distance_to_threshold`, `rising_updates`, `watching`, `watch_reason`,
  `source_updated_at`, `taken_at`. No `trend`: a subject's trend up to run n is its
  `value` in the earlier runs' rows. No rows for editions 1-28.
- **P3** (merged 29 Oct, from edition 29): `pipeline_runs.severity_config` (jsonb),
  severity.toml as the edition ran it, the same dict every severity stage got: e.g.
  `severity_config.fire.level_2_min_ratio`, `.quake.level_3_min_magnitude`. Editions
  1-28 are backfilled from git history and carry `_backfill: {commit, certain, note}`.
  Editions 1, 9 and 10 have `certain: false` (manual runs, assumed to be from the main
  checkout). Edition 28 is the first with `fire.complete_day`. Ignore keys starting with `_`.
- **P4** (merged 29 Oct, from edition 29): table `fire_day_points`, one row per UTC day,
  kept for good: `acq_date` (primary key), `fire_events`, `states` (text[]), `points`
  (jsonb), `last_run_id`, `updated_at`. `points` = one array per fire event, earliest
  first: `[latitude, longitude, hotspots, frp_max, first_seen, state]`, where
  `first_seen` = minutes after 00:00 UTC on `acq_date` and `state` = an index into
  `states`. A day's row is rewritten by every run whose FIRMS window holds it (today and
  yesterday, UTC), so it is final two days later. For edition n's map: the fire items'
  `figures.day`, keeping points with `first_seen` up to the minute of its FIRMS data
  time (`figures.data_to`). Rows start with 19 Oct: 19-27 Oct were copied from
  `fire_events` on 29 Oct (every count and point checked against it), so every
  edition's map has its points (edition 2, the first fire stage run, fetched 19 and 20
  Oct; nothing earlier was stored). Also: each fire item's
  `figures.large_fires_near_people[]` now has `latitude` and `longitude`.
- **P5** (merged 29 Oct, from edition 30, 20:30 IST): on the air item (`air:IN`), each
  entry of `figures.cities[]` (the cities at Poor or worse) has `latitude` and
  `longitude`, next to its `city`, `band` and reading (`aqi` from data.gov.in, or
  `pm25_24h`/`pm10_24h` from the OpenAQ fallback). The position is the mean of the
  stations counted for the city (coordinates outside India's bounding box skipped);
  null if none has coordinates (none so far: all 524 feed stations have them). Use the
  severe guard's `counted_as` for the band shown, as the reason does.
- **P6** (merged 29 Oct, from edition 30): on each fire item, `figures.state_rank` (1 =
  the most fire events that day of every state with fires, not only those on the desk),
  `figures.rank_shared` (true when another state had the same count) and
  `figures.states_with_fires`. Null rank for a state with no fires that day.
- **P7** (merged 29 Oct, from edition 30): on a cyclone item, `figures.position` =
  `{latitude, longitude, at}`: where the storm was and when (`at`, UTC). Correction to
  the P7 note above: for a cyclone, GDACS's point is the storm's latest observed track
  point, at the episode's `todate`. The event-list point, the geometry's
  `Point_Centroid` and the latest observed `Point_Polygon_Point` were the same for all
  six storms checked on 29 Oct, ARNAB-26 included. So the item's `latitude`/`longitude`
  already follow the storm, and P1's snapshot position is the storm's at each edition.
  Floods get no `position` (their point is the area's).
- **Wording** (merged 29 Oct, from edition 30): the cyclone reason gives the wind speed
  ("GDACS Orange alert, 222 km/h winds (event peaked Red)"), so don't add it again from
  `figures.severity`. The air all-clear names the source that assessed it: "No city Poor
  or worse (CPCB AQI, real-time, unvalidated)" or "(approx. CPCB band)", and neither
  when last-known.

### Used by the frontend (29 Oct 2026)

- **P1:** `SNAPSHOT_SELECT` reads the snapshot's `title`, `place_name`, `latitude`,
  `longitude`; when `title` is set they win over `desk_items` (`entries.ts`, `ownPlace`).
- **P2:** `useWatching(run, latest)` reads `desk_watch_snapshots` of the edition and
  builds each watching subject's trend from its rows in the 30 runs before
  (`lib/desk/watch.ts`). No rows: the latest edition falls back to `desk_watch`; a past
  edition says from which edition lists are kept.
- **P3:** `useEdition` reads `severity_config`; `scaleFrom()` turns it into the scale
  the copy context, Notes, the levels table, the item's fire chart and About use. A rule
  the stored config lacks is one the edition ran without (null), not today's value.
- **P4:** `useFirePoints(fireLayerOf(...))` reads `fire_day_points` and keeps points
  with `first_seen` up to `figures.data_to`; a Level 4 state's large fires are ringed by
  their stored `latitude`/`longitude`.
- **P5** (30 Oct): `airPoints()` (`mapdata.ts`) turns the air item's
  `figures.cities[].latitude`/`longitude` into squares, worst first, in the band each
  counts in; the map page has an Air layer row (on), and the air item's page shows them
  on its small map. Editions before 30 have no positions and say so. The Desk's small map
  has no air squares.
- **P6** (30 Oct): `figures.state_rank` and `rank_shared` let the fire copy say "the
  most of any state" (rank 1) or "tied for the most" (shared); see the style guide.
- **P7** (30 Oct): a cyclone's `figures.position` sets its entry's position (marker and
  "They place it …"), ahead of the snapshot's point. When `position.at` is more than six
  hours older than the edition, the source line dates it: "GDACS (position as of 28 Oct,
  11:30 IST)" (`notes.ts`, `positionAsOf`; Job, 30 Oct).
- **Map page** (30 Oct, Job): the Layers rows, with their small symbols, are the key; the
  full explanation is a collapsed "How to read the map" under the map.

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
7. The copy reads as news for ordinary readers (`docs/style-guide.md`); exact figures stay
   as evidence under each story.
8. Ranking: keep the ratio within fires; at the same level, categories in the order
   cyclone, flood, earthquake, air, fire.
9. Fire states are one roundup story; a state gets its own story at Level 3+ or when it
   is the only fire state. A record for the time of year leads the roundup (Job's example
   title for No. 25) rather than splitting the state out; "spreading" compares with the
   edition a day earlier, like Since yesterday.
10. "How levels are set" moves to a collapsed footer section and About.
11. Facts in the story, caveats in notes (style guide). Titles and standfirsts state one
    fact per sentence, without hedges. Each item has a source line ("Source: CPCB live
    data (unvalidated)"); a last-known item gets an "As of Saturday" kicker; the fire cap
    shows only as the dashed square (also in the state table), explained once in the
    page's Notes, with any Severe city not yet confirmed. States that fell back are in
    Since yesterday, not in another state's story. Within its range a state's title keeps
    the plain multiple ("run at twice the usual") and the standfirst gives it against the
    average ("about double the late-October average but normal for the season"), as in
    Job's example.
12. Map symbols per hazard, after `docs/design/MapSymbols.dc.html` ("A2 · Map symbols",
    28 Oct): ink for Levels 1–2, red from Level 3, size carries strength. Fire: dots in
    warm ember (#B4532A), 0.55 at or near normal, 0.75 above it, red 0.8 from Level 3; the
    state's rank badge at the centre of its fires, none at Level 1; at Level 4 the large
    fire near a town is ringed (matched by `fire_events.id`). Earthquake: ripples, one
    ring more than the level (2 to 5, 5 px apart, fading outward); the key and labels use
    the USGS class words. A group of small quakes has one badge, on its largest quake.
    Flood: wave lines, one per level, flood blue (#1F4E8C) below Level 3, wider at 3 and
    4, a faint halo at 4. Cyclone: Sentinel's spiral (Job kept it over the sheet's),
    sized by wind, red from Level 3, a faint halo and one slow pulse at Level 4 (no pulse
    with reduced motion). The rank number is a small badge on the symbol; the map page's
    Layers list is the key. Air, once P5 lands: a soft square per city at poor or worse,
    sized and tinted by band in slate blue (Job kept these over the sheet's ochre), red
    for Severe, under every hazard (its own pane below the fire dots); only the worst
    city is named, left of its square, else on the first side clear of every marker, else
    not at all. On the map from edition 30 (P5), with its own Layers row; see "Used by
    the frontend".
13. `/dev/symbols` draws every symbol at every level, the size ramps, selected and closed
    markers, the air squares and a made-up busy day, so quake and flood symbols can be
    checked without a real event. Not linked from the site, `noindex`. It is in
    `npm run dev` and in `npm run build:preview` (VITE_DEV_PAGES=1, used for the preview
    on the Pi); the plain `npm run build` that Render runs leaves it out of the bundle.
