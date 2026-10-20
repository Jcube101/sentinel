# Sentinel — Severity & Fire-Event Pipeline (brief for Claude Code)

Status: **plan approved 20 Oct 2026, build in progress** (see *Decisions* and *Build plan* below).
Written 20 Oct 2026 after the Sentinel redesign session.
Design reference: "Sentinel — Design Directions" canvas, artboards **A2 · Desk ranked by severity** and **A2 · Quiet-day desk**.

## The problem

FIRMS returns **hotspots** — individual 375 m satellite pixels that read hot — not fires.
Every other source returns **events** (one quake, one cyclone, one flood). A typical run
has ~2,000 FIRMS rows vs ~6 quakes, 1 flood, 1 cyclone, so fires swamp every count,
stat strip and ranking. Raw counts are not comparable across sources.

The fix is in the pipeline (Pi, Python → Supabase), not the UI.

## Goal

Every desk item carries a **severity level 1–4** on one shared scale, and the frontend
ranks by level (then novelty), never by raw count. Fires reach the UI as **fire events
aggregated by district**, with hotspots kept only as supporting evidence.

## Work items

### 1. Cluster FIRMS hotspots into fire events
- Group hotspots within ~1–2 km of each other in the same 24h window into one fire event
  (e.g. DBSCAN on lat/lon with haversine, or a simple grid-cell merge — pick whatever
  runs comfortably on the Pi 3x daily).
- Per event store: centroid, hotspot count, max/sum FRP (fire radiative power — FIRMS
  provides it per pixel), first/last seen, confidence mix.
- Filter to nominal + high confidence.
- Then roll events up by **district** (needs an India district boundaries file — check
  licensing; a GeoJSON from a public source is fine) → "fire activity in N districts".

### 2. Seasonal baseline for fires
- Pull FIRMS archive for the same calendar week in prior years (e.g. 2023–25) for India.
- Store a baseline per week (and ideally per state) → compute `ratio_to_norm`.
- October Punjab/Haryana stubble burning should read as "seasonal", not an emergency.

### 3. Severity mapping (one level per item)
Draft thresholds, to be tuned:

| Source | 1 Minor | 2 Elevated | 3 High | 4 Severe |
|---|---|---|---|---|
| GDACS flood/cyclone | green | green + rising | orange | red |
| USGS quake | < M5 | M5–5.9 | M6–6.9 | M7+ |
| OpenAQ air (CPCB AQI bands) | poor | very poor | severe, 1 city | severe, 3+ cities |
| FIRMS fire | at norm | 1.25–2× norm | 2×+ norm or forest fire | high-FRP fire near population |

- Store `severity_level` + `severity_reason` (human string, e.g. "GDACS orange",
  "1.45× seasonal norm") on each item — the UI shows the reason.
- Check whether **GDACS wildfire alerts** cover India well; if so they may give fire
  severity for free and could replace or cross-check the FIRMS-derived level.

### 4. Per-run snapshots (needed by the redesign)
- Keep a snapshot of every desk item per run (run id, level, key figures) in Supabase,
  not only the latest state. Powers: "since yesterday" diff, item history, trend charts,
  the Edition strip and "← No. 292" navigation.
- Define open / escalate / close rules per category (e.g. fire item opens when ≥ level 2,
  escalates on level increase, closes after 48h at level 1 or no detections).

### 5. Freshness stays first-class
- Keep per-source last-good-fetch timestamps; an item whose source failed is marked
  "last-known" rather than dropped (see OpenAQ empty-pull case in the mockups).

### 6. Quiet-day support (from the quiet-day desk mockup)
- **"Watching" list:** for each category, compute distance to the next level threshold
  and surface anything within a margin (e.g. within 5% of the threshold, or rising for
  3+ runs toward it). Store `next_threshold`, `distance_to_threshold`, recent trend.
- **Per-category status** even when nothing is open: current level (or "none open"),
  one-line summary, source — so the desk shows an "all clear" table instead of an
  empty list.
- **Daily max level** (most severe item per day) for the 14-day strip, and
  **days since last Level 3+** with the item that set it.

## Open questions for Job (answered)
- District rollup vs state rollup for fires — district is more precise, state is simpler. - District is good
  (refined in decision 2: districts are the rollup unit in the data, the desk item is per state)
- How many years of baseline are worth the archive pull - 2 Years (2024–2025)
- Thresholds above are a first guess; review before building. → all drafts live in
  `pipeline/severity.toml`, tunable without code changes.
- "Watching" margin — how close to a threshold counts as worth watching. → spec draft
  (within 5%, or rising for 3 updates) goes into `severity.toml`.

## Decisions (20 Oct 2026)
1. **Schedule:** the timer is correct — 09:00 / 15:00 / 21:00 UTC = **14:30 / 20:30 / 02:30 IST**.
2. **Fire desk unit:** one fire item **per state**, levelled on the state's ratio to its
   seasonal norm, listing its districts ("fire activity in 9 Punjab districts").
   District-level data stays in `fire_events`.
3. **Quake scope:** quakes **within 100 km of India**, plus **M6+ anywhere** in the current
   USGS search box. Hindu Kush / Myanmar M4–5.9 quakes do not become desk items.
4. **Air quality:** one **national** air-quality item. The CPCB band is computed from a
   24 h mean of OpenAQ readings, not official CPCB AQI, so it is marked **approximate**
   in the data (a flag plus the reason string) for the UI to label.
5. **GDACS wildfire alerts:** kept **out of `events`** (EONET already carries the same
   alerts). Used only as the **forest-fire trigger for Level 3**. GDACS has never issued an
   Orange/Red wildfire alert for India (2023–2026, all Green), so it cannot replace the
   FIRMS-derived level.
6. **Migrations:** SQL files in `pipeline/migrations/`, pasted into the Supabase SQL editor
   by Job. Each includes the Data API grants (see `pipeline/CLAUDE.md`).

## Build plan
Rules: one work item at a time, each tested and committed separately; the existing
`events` / `aqi_readings` output keeps working until the new output is verified (new
stages run after the existing writes, each isolated so a failure alerts but cannot
affect current output); all thresholds in **one** config file, `pipeline/severity.toml`.

0. **Prep.** GDACS paging fix (the API caps pages at 100 rows and `country=IND` also
   matches Indonesia, so each run saw ~4 of 13 India events); GDACS WF kept out of
   `events`; pytest dev setup; `severity.toml` with the draft thresholds.
1. **Runs + freshness.** `pipeline_runs` (run id = edition number) and per-source
   last-attempt / last-good-fetch / last-error / row-count on `sources`.
2. **Desk items + snapshots** for quakes, floods and cyclones: `desk_items`,
   `desk_item_snapshots`, levels, open/escalate/close rules, "last-known" when a source fails.
3. **Air-quality item** (national, approximate CPCB band from 24 h means; station → city
   via GeoNames cities15000, CC BY 4.0).
4. **Fire clustering + district rollup** into `fire_events` (nominal + high confidence,
   ~1.5 km single-linkage clusters, district/state by point-in-polygon; adds `shapely`).
   The **static heat-source mask** (below) is applied **before clustering**.
5. **Fire baseline.** One-off pull of the 2024–2025 VIIRS NOAA-20 SP archive (~147 five-day
   requests, ~1,300 FIRMS transactions, paced; raw CSV kept on the Pi, only aggregates go to
   Supabase) → `fire_baseline` (mean daily fires per state per calendar week).
   The same pull builds the **static heat-source mask** from archive points with
   `type` = 2 (static land source) or 3 (offshore) — steel plants, refineries, gas flares,
   coal-seam fires — because the live NRT feed has no `type` column.
6. **Fire severity** per state: `ratio_to_norm`, with a **minimum fire count** (in
   `severity.toml`) before the ratio counts, so a 0.3-fires/day state doesn't read 10× on
   a 3-fire day; GDACS WF alert in the state → Level 3 "forest fire"; high-FRP cluster near
   a populated place → Level 4.
7. **Quiet-day support:** watching list, `category_status`, daily max level (IST day) for
   the 14-day strip, days since last Level 3+.

Notes that apply across steps:
- **"Rising for 3 updates" counts new source data, not runs.** FIRMS publishes twice a day
  in practice (the 02:30 IST run always repeats the 20:30 run's FIRMS data), so trend
  counters advance only when a source's data actually changes.
- Desk item ids are deterministic (`earthquake:USGS-…`, `flood:GDACS-FL-…`, `cyclone:GDACS-TC-…`, `fire:<state>`, `air:IN`).
- Existing `events.severity` labels (low/medium/high/extreme) are left unchanged.
- **TODO (About page, separate frontend task):** credit geoBoundaries (district boundaries,
  ODbL 1.0, source LGD via Pathways Data) and GeoNames (CC BY 4.0).

## Non-goals
- No frontend changes in this task — UI redesign is separate (Situation Report direction A).
- Not changing the schedule (09:00 / 15:00 / 21:00 UTC = 14:30 / 20:30 / 02:30 IST).
