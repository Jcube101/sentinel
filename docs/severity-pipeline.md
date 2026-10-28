# Sentinel — Severity & Fire-Event Pipeline (brief for Claude Code)

Status: **complete, 21 Oct 2026; last updated 28 Oct 2026.** Build steps 0-7 are merged and
run on the Pi three times a day; migrations 001-006 are applied (checked 28 Oct: every table
and view they create answers through the Data API). *Where things stand* lists the changes
since and how far each has been verified. What is left is under *Follow-ups*; the UI that
reads the new tables is the next, separate frontend task (*Non-goals*).
Written 20 Oct 2026 after the Sentinel redesign session.
Design reference: "Sentinel — Design Directions" canvas, artboards **A2 · Desk ranked by severity** and **A2 · Quiet-day desk**.

## Where things stand (28 Oct 2026)

Every run is an edition (`pipeline_runs.id`). Edition 1 ran on 20 Oct; the latest checked,
edition 25 (28 Oct, 02:30 IST), was ok: 662 s, every source ok. Of editions 1-25, two
failed: 10 (a GDACS HTTP error, which still fails a run) and 19 (a single FIRMS timeout,
which no longer does).

| Change | Merged | Verified |
|---|---|---|
| Steps 0-7: runs, desk, air item, fire events, baseline, fire desk, quiet-day desk | 20-21 Oct | Steps 0-2 since edition 1 (20 Oct), all eight since 21 Oct |
| data.gov.in as the primary air source (`datagov.py`, migration 006) | 23 Oct | Live since edition 9. The feed returned HTTP 500 in editions 21-22 and recovered by itself; it set the air level in editions 23-25 |
| Air fallback never replaces a level with older data, plus the no-mean guard (decision 6 under *air source*) | 28 Oct | Offline tests and dry runs. Not yet exercised live: the feed has answered in every run since |
| GDACS: no droughts, 90 s read timeout, each page's time logged | 28 Oct | Live since edition 25. Whether 90 s stays is **not decided yet** (*GDACS reliability* under *Follow-ups*) |
| FIRMS fails the run only after 2 timeouts in a row | 28 Oct | Offline tests. Not yet exercised live: FIRMS hasn't timed out since edition 19 |
| Fire levels only from complete days (night pass in), repair of editions 26-27 (*Decisions (29 Oct 2026)*) | 29 Oct | Offline tests, a dry run, and the fire desk run read-only against live data on 28 Oct 20:13 UTC: 27 Oct incomplete (one night orbit), five items restored to 26 Oct as last-known |
| Wind speed in the cyclone reason; `last_known` in `desk_last_level3` | not built | Specified for the frontend phase (*Follow-ups*) |

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
| FIRMS fire | at norm | 2–4× norm (draft: 1.25–2×) | 4×+ norm (draft: 2×+) or forest fire | high-FRP fire near population |

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
   in the data (a flag plus the reason string) for the UI to label. (Since 23 Oct this
   describes only the OpenAQ fallback; see *Decisions (21 Oct 2026): air source*.)
5. **GDACS wildfire alerts:** kept **out of `events`** (EONET already carries the same
   alerts). Used only as the **forest-fire trigger for Level 3**. GDACS has never issued an
   Orange/Red wildfire alert for India (2023–2026, all Green), so it cannot replace the
   FIRMS-derived level.
6. **Migrations:** SQL files in `pipeline/migrations/`, pasted into the Supabase SQL editor
   by Job. Each includes the Data API grants (see `pipeline/CLAUDE.md`).

## Decisions (21 Oct 2026)
1. **Fire level from the last complete UTC day** (yesterday) vs its norm. Today's partial
   count is shown in figures only, marked partial; it never sets the level. "Complete" now
   means FIRMS holds the night pass (*Decisions (29 Oct 2026)*).
2. **Calibration cap:** until the live-vs-archive comparison (follow-ups) is done,
   FIRMS-derived fire levels are capped at 2 (`fire.calibration_cap` in `severity.toml`).
   A current GDACS wildfire alert in the state can still lift an item to Level 3. The reason
   says when the cap lowers a level.
3. **Fire thresholds:** at least **25 fire events** before any ratio counts, **Level 2 at 2×**
   the norm, **Level 3 at 4×** (replacing the draft 10 events and 1.25× / 2×). A replay of the
   step-6 rules over the 2024-2025 archive (norms from the same data, so in-sample) showed the
   drafts would keep ~6 fire items open on an average day (p90 13) and open ~590 a year: a
   single day's count is bursty (cloud, satellite swath). The new values keep ~1.8 open
   (median 1, p90 5) and open ~240 a year. Level 4 (100 MW within 10 km of 100,000+ people)
   fired on 7 state-days in 2 years. Tune with the replay tool (*Tuning fire thresholds*).

## Decisions (21 Oct 2026): air source
Follow-up "Fresher air source", evaluated and built the same day (`datagov.py`, `air.py`,
migration 006).
1. **data.gov.in is the primary source for `air:IN`, OpenAQ the fallback.** The feed
   ("Real time Air Quality Index from various locations", CPCB) is hourly and ~0.5-1.5 h old;
   OpenAQ's CPCB data had stopped at 18 Oct 14:00 IST. Fall back when the feed fails, has too
   few cities, or its snapshot is older than `air.datagov.max_snapshot_age_hours` (6).
2. **Full CPCB method:** the feed's values are CPCB's AQI sub-indices (not concentrations).
   Station AQI = highest sub-index, only with 3+ pollutants including PM2.5 or PM10; city AQI
   = mean of its stations. On 21 Oct this matched CPCB's 4 PM bulletin for 229 of 239 cities
   (mean difference 4 AQI points).
3. **Reason names the source:** "CPCB AQI, real-time (unvalidated)" from the feed, "approx.
   CPCB band" only from the OpenAQ fallback; `desk_items.source` is DATAGOV or OPENAQ.
4. **Severe guard for unvalidated data:** a city counts as Severe toward Level 3/4 only after
   `air.severe_confirm_runs` (2) consecutive assessments; until then it counts as Very poor.
   Very poor and below count at once.
5. The map's `aqi_readings` stay on OpenAQ. The API hangs requests that carry Python's default
   user agent, so the client sends its own.
6. **The fallback never replaces a level with older data (28 Oct 2026).** In edition 21 the
   feed failed (HTTP 500), and the fallback raised air from Level 1 to 2 using 24 h means that
   ended 23 Oct 21:00 IST. The feed's Level 1 was from 26 Oct 14:00 IST, three days newer.
   Edition 23 dropped it back. Now an OpenAQ reading counts only if it is no older than the
   data behind the item's current level: the feed's snapshot, or the oldest 24 h window of an
   OpenAQ level. Otherwise the item stays last-known with the reason "OpenAQ data runs to …,
   older than the current level (…)". The check runs before the history requests.
   Also kept last-known: a run where stations near Poor were asked for 24 h history and none
   had the 16 hourly values a mean needs. On 27 Oct, OpenAQ's data had just come back after
   3.5 days with under 16 h of it, and the fallback read that as no city Poor and would have
   closed the item.

## Decisions (28 Oct 2026): source timeouts
From a health review of editions 11-24.
1. **FIRMS fails the run only after 2 timeouts in a row.** Edition 19 failed on one FIRMS
   timeout while every other stage worked and the fire desk kept its items last-known. Now a
   FIRMS timeout (after its 3 tries) fails the run only if FIRMS's `sources.last_status` from
   the previous run is also `timeout` (`FAIL_ON_SECOND_TIMEOUT` in `pipeline.py`). If that
   status can't be read, the timeout fails the run as before. HTTP and parse errors still
   fail at once, and a longer outage still trips the 2-day FIRMS staleness alert.
2. **GDACS: no droughts, 90 s read timeout.** GDACS timeouts already never failed the run (it
   is event-driven and has had multi-hour outages where it hangs). The desk doesn't use
   droughts, so they are no longer requested. GDACS alone gets a 90 s read timeout
   (`config.GDACS_READ_TIMEOUT_S`; the connect timeout and every other source keep 30 s), and
   each page's time is logged. 90 s stays until the decision under *Follow-ups*.

## Decisions (29 Oct 2026): complete fire days
Edition 26 (28 Oct, 14:30 IST) levelled 27 Oct on FIRMS data that ended at 09:07 UTC, the
day pass only, and de-escalated Telangana, Chhattisgarh, Maharashtra and Uttar Pradesh to
Level 1 (Telangana on 1 fire event, Chhattisgarh on 0). Edition 27 repeated it. Their quiet
clocks started on 27 Oct, so a quiet 28 Oct would have closed all four. No other fire item
was opened, escalated, de-escalated or closed on an incomplete day: every other judged day
(20-26 Oct) had its full night pass, the last orbit included.
1. **A UTC day is complete once FIRMS holds its night pass** (`[fire.complete_day]`). FIRMS
   rows, 29 Aug-27 Oct 2026: the day pass falls at 05:44-09:37 UTC, the night pass at
   18:21-22:18 UTC in 2-3 orbits ~100 min apart, nothing in between; the first orbit can hold
   a single hotspot. Rule: the day's hotspots from 14:00 UTC on span at least 60 min (two
   orbits). Next-day data is no proof: on 28 Oct FIRMS delivered 27 Oct's last orbit
   (62 hotspots, 21:2x UTC) and 28 Oct's day pass, but not 27 Oct's main orbit (~300).
   In the complete 2024-2025 archive, 719 of 730 nights pass; the other 11 (one orbit with
   no fires, mostly Jul-Sep) are skipped. A night/day count ratio can't tell partial from
   complete (complete days go as low as 0.06).
2. **Until yesterday is complete, open items keep the last complete day's levels**,
   last-known, reason "… · last known: 27 Oct incomplete in FIRMS (night pass partly in,
   data to 21:33 UTC)". Today is never judged: at the 21:00 UTC run at most its first orbit
   is in.
3. **Repair:** an open item whose stored level was set on an incomplete day (data time
   before 14:00 UTC; only editions 26-27) goes back to its last snapshot from a complete
   day (level, reason, figures and quiet clock, title, data time) before the run judges
   anything. Fire trend points from such days are dropped from `desk_watch`. The snapshots
   of editions 26-27 stay as they were: they record what those editions said.
4. Known gap: a three-orbit night whose middle (main) orbit is missing while the first is
   present still passes. Not seen so far.

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
3. **Air-quality item** (national, `air:IN`): reference monitors only (CPCB, AirNow), city
   taken from CPCB's own station names ("R K Puram, Delhi - DPCC"), 24 h means from OpenAQ
   hourly data for cities near "Poor" (request budget in `severity.toml`), CPCB breakpoints,
   marked approximate (`figures.approximate` + "approx. CPCB band" in the reason).
4. **Fire clustering + district rollup** into `fire_events` (nominal + high confidence,
   ~1.5 km single-linkage clusters, district/state by point-in-polygon; adds `shapely`).
   The **static heat-source mask** (below) is applied **before clustering**.
5. **Fire baseline.** One-off pull of the 2024–2025 VIIRS NOAA-20 SP archive (~147 five-day
   requests, ~1,300 FIRMS transactions, paced; raw CSV kept on the Pi, only aggregates go to
   Supabase) → `fire_baseline` (mean daily fires per state per calendar week).
   The same pull builds the **static heat-source mask** from archive points with
   `type` = 2 (static land source) or 3 (offshore) — steel plants, refineries, gas flares,
   coal-seam fires — because the live NRT feed has no `type` column.
6. **Fire severity** per state (`fire_desk.py`, item `fire:<state slug>`): `ratio_to_norm`
   on the last complete UTC day, with a **minimum fire count** (in `severity.toml`) before
   the ratio counts, so a 0.3-fires/day state doesn't read 10× on a 3-fire day; GDACS WF
   alert in the state → Level 3 "forest fire"; high-FRP cluster near a populated place
   (GeoNames, `data/india_places.csv`) → Level 4; FIRMS-derived levels capped at
   `fire.calibration_cap` (decision 21 Oct). Closes after `close_after_hours` of complete
   days below Level 2. No migration (uses `desk_items` / `desk_item_snapshots`).
7. **Quiet-day support** (`watch.py`, migration 005): watching list, `category_status`, daily
   max level (IST day) for the 14-day strip, days since last Level 3+.
   - **Watching** (`desk_watch`, one row per subject): each stage measures its subjects against
     the threshold of their next level. Quakes: magnitude vs the next band. Floods and
     cyclones: GDACS episode scores are fixed per colour (Green flood 0.5, Green cyclone 1.0),
     so there is no distance; only a score rising over `rising_updates` episodes counts. Air:
     the city the next level hinges on (the worst for Poor / Very poor, the Nth-worst for
     Severe in N cities) vs that band's start. Fire: every state's fire events on the complete
     day vs the count its next level needs, max(minimum, ratio × norm); levels above
     `calibration_cap` are not measured (only GDACS can lift a capped state). Watching = within
     `margin` (5%) of the threshold, or `rising_updates` (3) source updates in a row toward it
     once at least `rising_min_progress` (half) of the way there.
   - **Category status** (`category_status`, one row per category per run; view
     `category_status_latest`): highest open level or none open, a one-line summary (the top
     item's title, or an all-clear line such as "No current GDACS flood alerts for India"),
     source and fetch status, last-known flag, watching count.
   - **14-day strip** (view `desk_daily_max`): most severe open item per IST day; 0 = runs but
     nothing open, null = no runs. **Days since last Level 3+** (view `desk_last_level3`).
     Both read `desk_item_snapshots`, so they need no pipeline code.

Notes that apply across steps:
- **"Rising for 3 updates" counts new source data, not runs.** FIRMS publishes twice a day
  in practice (the 02:30 IST run always repeats the 20:30 run's FIRMS data), so trend
  counters advance only when a source's data actually changes.
- Desk item ids are deterministic (`earthquake:USGS-…`, `flood:GDACS-FL-…`, `cyclone:GDACS-TC-…`, `fire:<state>`, `air:IN`).
- Existing `events.severity` labels (low/medium/high/extreme) are left unchanged.
- **TODO (About page, separate frontend task):** credit geoBoundaries (India outline and
  district boundaries, ODbL 1.0, source LGD via Pathways Data) and DataMeet / Election
  Commission of India (state boundaries, CC BY 2.5 IN), GeoNames (populated places,
  CC BY 4.0) and CPCB via data.gov.in (real-time AQI, Government Open Data License -
  India); the FIRMS acknowledgement covers the baseline and mask. See
  pipeline/data/README.md.

## Tuning fire thresholds
`pipeline/tools/replay_fire_levels.py` runs the live fire desk code over every day of the
2024-2025 archive (one run per day, nothing written) and reports how many fire items the
desk would hold, how often each state reaches each level, and the Level 4 cases. From
`pipeline/` (~1 min on the Pi; `<firms-archive-dir>` is the raw SP archive pulled by
`tools/pull_firms_archive.py`, kept outside the repo):

```bash
PYTHONPATH=. .venv/bin/python tools/replay_fire_levels.py \
    --cache-dir <firms-archive-dir> \
    --set fire.min_fire_events=30 --set fire.level_2_min_ratio=2.5
```

`--set` changes one `severity.toml` value for that replay only (repeatable; any key, e.g.
`fire.lifecycle.close_after_hours=72`); without it the current file is replayed. When a
result looks right, put the values in `severity.toml`. The replay is in-sample (the norms
come from the same days), so live levels will be a little noisier; GDACS wildfire alerts
are not replayed; mask, clustering or confidence changes need a baseline rebuild first.

## Follow-ups (not scheduled)
Open as of 28 Oct 2026 (first listed 21 Oct, when the spec was completed).
- **Live vs archive fire counts, then the calibration cap:** see the last item; once the norm
  is checked (and scaled if needed), decide whether to raise `fire.calibration_cap` from 2.
  Until then FIRMS-derived fire items never show above Level 2 (Level 4 "large fire near
  people" included); only a GDACS wildfire alert lifts a state to Level 3.
- **Frontend (separate task):** the redesign reads `desk_items`, `desk_item_snapshots`,
  `desk_watch`, `category_status_latest`, `desk_daily_max`, `desk_last_level3`,
  `fire_events` (+ views) and `fire_baseline`; the About-page credits (TODO under *Build
  plan*) go in with it. Design mock-ups: `docs/design/` (added 28 Oct 2026).
  Two pipeline changes go in with it (added 28 Oct 2026):
  - **Wind speed in the cyclone reason:** "GDACS Red alert" says nothing about strength.
    The speed is already in the item's figures (`severity`, `severity_text`), e.g. "GDACS
    Red alert, 222 km/h winds" for ARNAB-26 (`desk.gdacs_candidates`).
  - **`last_known` in `desk_last_level3`:** the view picks the latest open Level 3+
    snapshot, last-known ones included (ARNAB-26 in editions 23–24, while GDACS timed
    out), and doesn't say so. Add the column (a migration) so the page can mark it.
- **Fire threshold tuning:** min 25 / 2× / 4× came from an in-sample replay; recheck with
  `tools/replay_fire_levels.py` against a few weeks of live items.
- **Static mask gaps:** a replayed Level 4 case near Dhanbad (Jharia coal field) is probably
  a coal-seam fire the mask missed; check live Level 4 candidates near mining areas.
- ~~**Fresher air source**~~: done 21 Oct 2026, see *Decisions (21 Oct 2026): air source*.
- **data.gov.in reliability:** one afternoon of evidence when it went in. Watch the DATAGOV
  row in `sources` (`last_status`, `newest_observation_at`) and how often the air reason says
  "approx. CPCB band" (the fallback); the map's `aqi_readings` could move to the feed later.
  Seen so far: the feed returned HTTP 500 in editions 21–22 (26–27 Oct), recovered by
  itself and answered in editions 23–25. OpenAQ's CPCB data stopped at 18 Oct 14:00 IST,
  and again from 23 Oct 21:00 to 27 Oct 09:00 IST (the gap wasn't backfilled). Since then
  it has run about 1–2 h behind real time, not the 2–3 days `air.fresh_within_hours` (72)
  was set for.
- **GDACS reliability (added 28 Oct 2026; decision pending):** GDACS is the only source for
  floods and cyclones. In editions 11–24 it returned no data in 5 of 14 runs, and a request
  ran past the 30 s read timeout in 11 of them. Droughts are no longer requested, the read
  timeout is 90 s (`config.GDACS_READ_TIMEOUT_S`), and each page's time is logged.
  Edition 25, the first run with these changes: three of six pages answered in 30–90 s
  (49, 60 and 78 s), three requests hit the 90 s cap and were retried, and GDACS took
  499 of the run's 662 s. **Decide after editions 25–27:** if no request answers between
  30 and 90 s, go back to 30 s and lead with a separate small query for the current alerts
  the desk needs; otherwise keep 90 s and decide whether that query is still worth adding.
- **Grants on `sources` (added 23 Oct 2026):** an anon-key update of the DATAGOV row returned
  HTTP 200 and changed nothing, where a revoked grant gives "permission denied". So RLS
  blocks the write, but anon probably still holds write grants on this older table (it
  predates the grant pattern). Fix with a migration in the standard pattern (revoke all
  from anon/authenticated, grant select to anon, grant writes to service_role), and check
  the other older tables (`events`, `aqi_readings`, `categories`) the same way.
  **28 Oct:** the same probe (an update matching no row) got HTTP 200 on all four older
  tables and "permission denied" on every table from 001 on. Migration 007 applies the
  pattern to the four (RLS on with a read policy, the id sequence too) and keeps anon's
  SELECT, since the live site reads `events` and `aqi_readings`. Removing that SELECT
  from the tables the new site doesn't read waits for the frontend switch.
- **Live vs archive fire counts:** the baseline uses the reprocessed FIRMS product (SP), the
  live feed is near-real-time (NRT). If NRT detects systematically more or fewer hotspots,
  every `ratio_to_norm` shifts. Only one partial day overlapped in Oct 2026 and FIRMS timed
  out on it; once SP covers Jul-Sep 2026 (about 3 months after the fact), compare it with
  the NRT hotspots kept in `sentinel_archive.db` and scale the norm if needed.

## Non-goals
- No frontend changes in this task — UI redesign is separate (Situation Report direction A).
- Not changing the schedule (09:00 / 15:00 / 21:00 UTC = 14:30 / 20:30 / 02:30 IST).
