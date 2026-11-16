# Sentinel style guide

How the site writes. Every line the desk generates (the page headline, item titles and
standfirsts, source lines, Notes, Since yesterday, the late notice, the phone wire) follows
this guide. The templates live in `frontend/src/lib/desk/` (`copy.ts`, `notes.ts`,
`words.ts`, and `sources.ts` for the late notice and footer); tests in `copy.test.ts`,
`notes.test.ts`, `quiet.test.ts`, `desk.test.ts` and `editions.test.ts` hold the examples
taken from real editions to the letter; the others show a template's shape.
Checked against the templates on 30 Oct 2026; change the guide and the tests together.

## Who we write for

Ordinary readers in India who want to know whether anything dangerous is happening, and
how unusual it is. They don't know what FIRMS, GDACS or an AQI sub-index is, and they
shouldn't need to. Write like a news report, not a database.

## The shape of an item

1. **Kicker,** only when the item wasn't updated: "As of Saturday" (see Facts in the
   story, caveats in notes).
2. **Title:** a news headline with a verb, saying what happened. "Fires climb in
   Gujarat for a third day, double the usual for late October". A named event may stand on its name
   alone ("Cyclone Arnab"); then the standfirst carries the verb.
3. **Standfirst:** one to three sentences, each a fact said plainly. What happened first,
   then how it compares with the usual. Fire: "Satellites picked up fires in 21 Madhya
   Pradesh districts yesterday. That's about double what late October usually sees."
4. **Source line,** small, like a photo credit: "Source: CPCB live data (unvalidated)".
5. **Evidence**, set smaller and quieter under the story: the figures strip or state
   table, the exact rule that set the level ("Level from: …"), links to the source's own
   page. Exact numbers, source names and technical terms belong here, not in the story.

## Rules

### Facts in the story, caveats in notes
State facts with confidence; caveats go in the source line or Notes.
- One fact per sentence, said plainly. No "on these counts", "before its own checks",
  "estimates", "incomplete", "according to", "not yet confirmed", "held at" or "would be"
  in titles or standfirsts.
- **Source line:** every item has one, after "Source:". How far to trust the figures lives
  here:
  - "CPCB live data (unvalidated)": the board's live feed, before its own checks.
  - "Sentinel estimate from OpenAQ monitors": the fallback when the board's feed is down.
  - "NASA FIRMS satellites (27 Oct incomplete: no data after 14:37 IST)": a fire day
    whose data stops before the night pass.
  - "GDACS (position as of 28 Oct, 11:30 IST)": a cyclone whose position (plan P7) is
    more than six hours older than the edition.
  - "GDACS", "USGS", "NASA FIRMS satellites; GDACS forest-fire alert".
  - "· didn't answer this time" when the item is last-known. When the air feed answered but
    its data was not used and nothing covered: "· CPCB data was old this time" /
    "· CPCB data was partial this time" (pipeline status `stale` / `incomplete`).
- **Kicker:** a last-known item gets a short kicker over its title, never a sentence:
  "As of Saturday" (fire: the day of the count), "As of 14:00 IST" (air read earlier the
  same day), "As of yesterday"; "Not updated" when its figures carry no time.
- **Notes,** at the foot of the page, say each remaining caveat once for the items it
  covers: the held fire level ("Fire levels from satellite counts are held at Level 2 for
  now, until live counts have been checked against past years. A dashed square shows the
  level a state would otherwise have: Chhattisgarh and Telangana would be at Level 3."),
  and a Severe city not yet confirmed ("Delhi read severe in the latest report. A city
  counts as severe only after two reports in a row."). The story itself shows a held level
  only as its dashed square.
- **Each story about its own subject.** Which fire states fell back belongs in Since
  yesterday, not in another state's story. (When easing is the story itself, the roundup
  names them; see Fire roundup.)

### Lead with what happened
Say what is happening in plain English, then give the number that shows it. Not "27 fire
events on 26 Oct, 9.07× the seasonal norm (3.0/day)", but "Fires climb in Chhattisgarh,
nine times the usual for late October".

### Translate and round numbers
| In the data | In the story |
|---|---|
| 9.07× the norm | about nine times the late-October average (standfirst); nine times the usual (title, within range) |
| 2.1× | about double the late-October average; twice the usual (title) |
| 1.5× | about one and a half times the average |
| 347.9 km | about 350 km (nearest 5 under 100 km, nearest 10 above) |
| 222.2 km/h | 222 km/h (measurements keep their figure) |
| AQI 293 (very poor from 301) | an index of 293, just short of 'very poor' (within 5% of the next band) |

- Multiples are words ("three times"); 20 and over round to the nearest 5.
- Spell out one to nine for counts of places and people ("four states", "six cities",
  "nine districts", "eight people", "two small earthquakes"); 10 and up in figures.
- Fires and readings are measurements: always figures ("27 fires", "an index of 301",
  "222 km/h").
- No × signs, decimals or units in titles and standfirsts, except wind speed, depth and
  distance, which readers know.

### Intensity matches the verdict
A title must not contradict its standfirst. Intensity words follow the verdict against
past years: see Fire. A title carries at most one multiple, in words ("double the usual",
"three times the usual"); the evidence gives the exact ratio. Never "×" or a decimal outside
the evidence.

### Words
| Not | But |
|---|---|
| fire events (clusters) | never counted in a title; the standfirst counts districts: "fires in 9 districts" |
| seasonal norm | "what late October usually sees" (standfirst); "the usual", "usual for late October" (titles) |
| ratio to norm | a multiple in words: "about nine times what late October usually sees"; never a decimal |
| AQI | an index of 301; the full name stays in the evidence and About |
| CPCB | the source line: "CPCB live data (unvalidated)" |
| unvalidated | the source line, in brackets: "(unvalidated)" |
| approximate (OpenAQ fallback) | the source line: "Sentinel estimate from OpenAQ monitors" |
| GDACS | global disaster monitors |
| USGS | the US Geological Survey |
| PAGER alert | the US Geological Survey's alert for likely impact |
| FIRMS | NASA's fire satellites (story); NASA FIRMS satellites (source line) |
| last-known | a kicker: "As of Saturday"; the source line: "didn't answer this time" |
| capped at L2 pending calibration | the dashed square; the Notes explain it |
| fetch failed / timed out | didn't answer |
| feed answered, snapshot too old / partial (`stale`, `incomplete`) | old data / partial data (never "didn't answer") |
| M7.0 | magnitude 7.0 |

### Fire: what we measure, and how it is said
We measure **satellite-detected fire clusters, rolled up to districts and states, judged
against the usual for this time of year.** We do not count individual fires on the ground,
so the copy never says "N fires" and never prints a cluster count: those stay in the figures
strip. Districts are the number the copy may print.

**Title formula: place + direction + benchmark.**
1. **Direction leads,** from yesterday and recent complete days: climb, surge, dip, ease,
   hold, spread. Run length when it is true: "for a third day", "after a three-day surge".
   A move is at least 15% and three clusters against the day before; less is holding.
   "Surge" is a jump (a rise of three-quarters or more); a run of rises is "climb".
2. **The benchmark is the contrast after a comma:** the usual for the season, in words:
   "double the usual for late October", "still above usual", "back to seasonal levels".
   "Above usual" is only said of a state above its norm; one at or below it (a Level 3 state
   on a wildfire alert alone) "continues", with "close to" or "below the usual" as benchmark.
   No decimals and no "1.7×" in reader copy. Multiples round to "one and a half times",
   "double", "three times".
3. **Past years only when it is a record:** "busiest late-October fire day in three years",
   the years being those the edition's own norm covers (`norm_years`, else its config):
   never a fixed "two". Said once, in the first edition that reports it (the 14:30 IST edition of that fire day); the
   later editions say "Fires stay above usual in Gujarat after record day".
4. **Numbers in titles:** district counts only, and only when spreading is the story
   ("Fires spread to 14 districts in Maharashtra": at least three more districts and a
   quarter more than the day before). Never cluster counts.
5. **A state that is busy but within its usual range is not news:** no headline and no
   title of its own; it sits in the roundup's table. (News is a record, a spread, a move
   day on day, or three days or more above usual. A Level 3 state is always news.)
6. **Never "farm" or "forest" fires** unless an Orange or Red GDACS forest-fire alert says
   so (a Green alert says nothing).

One-time verbs (climb, surge, dip, ease, spread, "ease back to seasonal levels") are for the
first edition of a fire day (the 14:30 IST edition, the one that reads the new complete day)
and for the edition whose own run recorded the change. The two editions after it, and every
later one, say where the state stands: "Fires stay above usual in Gujarat for a fourth day"
(the run, from the third day on).

**The standfirst supports the headline, using the same measure.** A record is about the day's
fires, so its standfirst says so and gives no comparison with the day before: "Satellites
picked up more fires in Maharashtra yesterday than on any early-November day in two years,
across 16 districts." A district comparison ("down from 18 on Tuesday") appears only when it
points the way the title does; one that contradicts the direction is dropped. An easing
standfirst keeps the benchmark sentence ("That's about what early November usually sees.").
States that fell to seasonal levels are named as they are now, not as a move: "Maharashtra,
Telangana and Karnataka are back to seasonal levels."

**A Level 1 fire state is a status line among the minor items, not a story:** "Madhya
Pradesh: fires at seasonal levels", with no standfirst. Only the edition whose own run eased
it has a news title ("Fires in Madhya Pradesh ease back to seasonal levels", with its
standfirst).

Targets (the tests hold them):
- Rising: "Fires climb in Gujarat for a third day, double the usual for late October"
- Record: "Gujarat sees its busiest late-October fire day in three years"
- Spreading: "Fires spread to 14 districts in Maharashtra"
- Easing, held: "Telangana fires dip after three-day surge, still above usual"
- Back to normal (first edition only): "Fires in Telangana ease back to seasonal levels"
- Several states: "Fires climb across western India, double the usual in Gujarat and Maharashtra"
- Persisting: "Fires stay above usual in Gujarat for a fourth day"

**Standfirst: numbers with their benchmark, sourced once.** "Satellites picked up fires in 9
Telangana districts yesterday, down from 15 on Sunday. That's still about one and a half times
what late October usually sees." The district count against the day before (only when it
changed), then the benchmark ("still" when the state is dipping or was just eased from a
higher level). Without the days before, the first sentence stands alone.

### Names, not IDs
"Cyclone Arnab", not "Tropical Cyclone ARNAB-26". "Madhya Pradesh", not
`fire:madhya-pradesh`. An unnumbered GDACS name ("TWO-26") is "an unnamed tropical
cyclone".

### Dates are relative to the edition
"today", "yesterday", "on Monday" (two to six days before), "on 19 Oct" (older). Always
relative to the edition's own IST date, never to the reader's clock, so an archived
edition reads as it did when it was published. Fire figures are for the last complete day,
so the 02:30 edition usually says "on Monday" where the 14:30 and 20:30 ones say
"yesterday". Months are told by thirds: early, mid-, late October ("the late-October
average").

### No self-reference
Never "top story", "on the desk", "in this report", "this edition", "the list" or "the
report" in generated copy. The headline states the news directly; its position on the
page shows it is the lead. Not "A severe cyclone is the top story today", but "Cyclone
Arnab holds at red alert" (No. 25). Not
"nothing in this report is above minor", but "A quiet day across India, with nothing above
minor". Closed items say what happened, not that they left a list: "Gujarat's fires have
stayed at seasonal levels for two days".

### Sources in the story
A source's own alert is reported as theirs, in words: "Global disaster monitors give it
their highest alert, red"; "The US Geological Survey's alert for likely impact is orange,
the second-highest of four". Everything else is stated as fact, and the source line
credits where it came from. The source's abbreviation stays in the source line and the
evidence.

### Never say more than the data
No landfall or track forecasts, no causes (crop burning, stubble), no land cover (farmland,
forest) unless an alert says so, no casualties or damage. A claim of our own needs a
figure behind it:
- "spread": the state's district count is at least three and a quarter more than the day
  before. "Climb", "surge", "dip", "ease": the day's count against the day before (see Fire);
  with no day before, the item's move since the edition a day earlier (new, reopened,
  escalated, de-escalated).
- "holds at red alert": the item was at the same level in the edition a day earlier.
- "ease back to seasonal levels": more fire states fell back to Level 1 than rose since a
  day earlier, on a complete day's counts. A day whose satellite data stops before the night pass (data before about
  18:00 UTC only) is incomplete: the source line says so, and the story claims no easing.
- "the busiest late-October fire day in three years": the state's fires beat the baseline's
  busiest day at this time of year, over the years the norm covers.
- "the worst air in the country": the worst of the cities reporting to the board's
  national feed.
- A cyclone's "winds of up to 102 km/h": the latest advisory's wind (from edition 32).
  GDACS's own figure is the storm's peak, so without the latest wind (editions before 32,
  or a run that couldn't read the track) it is said as the peak: "peak winds of 222
  km/h". "Its winds peaked at 222 km/h." only when the peak is above the latest wind.
- A closed cyclone "weakens": its latest wind is below its peak; "after crossing the
  Andhra Pradesh coast": it made landfall, in that state (the first point over land
  after one at sea). Without either, the plain closing line.
- A neutral verb ("stay above usual") when nothing changed.

### Every line rebuilds for past editions
Templates read only the edition's own data: its snapshots, its run time and the
comparison with the edition a day earlier. Nothing from "now", so `/edition/:n` prints the
same words today as it would have when it was published. That includes the source line,
the kicker and the Notes.

## The page headline

The test: would a desk editor at The Hindu print it as written? One main event, and
optionally a second, joined by "as" (or a semicolon). About twelve words at most; when two
events do not fit in twelve, the second is dropped, never squeezed. The headline says what
happened; what is new since yesterday belongs in Since yesterday, not here.

Rules:
1. **One main event, optionally a second of another kind.** Never a third. Clauses are not
   stacked: no appended "led by …" or "now including …" tail.
2. **A strong verb, one-time verbs once.** Verbs that announce a change ("flare", "climb",
   "surge", "turn", "cross", "strike") are used only in the first edition that reports the
   change: the edition whose own run recorded it (a state opened, reopened or rose a level; air
   moved a band; a storm's landfall within the last run's interval; a quake's first edition).
   Every edition after says where things stand, in ongoing wording: fires "stay above usual in
   Maharashtra"; air "stays severe in Ballabgarh"; a storm "weakens inland over Andhra
   Pradesh" (or "moves inland"), or "holds at red alert" when nothing moved; a quake "struck".
   A verb never claims an earlier state the item did not have: a storm that appears in this
   edition "forms in the Bay of Bengal" ("strengthens" only for one already on the desk that
   rose a level), and a quake "strikes" only in the edition it opens ("struck" for a revised
   one). A flood that opens is a first report and ranks as one; "worsens" and "eases" are for
   one already on the desk.
   Easing ("fires ease …", air "eases to …") is also said once. For fire the verbs are
   climb, surge, dip, ease, spread (see Fire); a fire clause may run to fourteen words when
   it is the headline alone, and is cut to its short form (no benchmark) when it shares the
   headline with a second event.
3. **No bookkeeping words,** ever: "one of them new", "both new", "now including", "led by",
   "on the desk", "top story", "spreading". That is the desk talking about itself, and it
   is Since yesterday's job (see also No self-reference).
4. **Name at most two places,** counting states, cities, coasts and seas. A region ("across
   central India") counts as one, a bare count ("in four states", "in eight cities") as
   none. A second event that would add a third place is dropped; so is one that would take the
   headline past twelve words, and the next event in line is tried instead.
5. **The lead.** Level 3 and above lead by level: a Level 4 item always leads, even when it
   only continues ("Cyclone Arnab holds at red alert"). Below Level 3 the most newsworthy
   event leads, not the highest category. In order: a record (said once); a change said for
   the first time (a one-time verb, easing included: "Fires ease back to seasonal levels …",
   "Air turns very poor …"); continuing items, where a state "after record day" (same fire
   day) outranks the others ("holds", "stays"). Within the same kind, the higher level, then
   category order (cyclone, flood, earthquake, air, fire) breaks the tie. Whether an item has
   a line in Since yesterday never counts: it is bookkeeping, not news (two Level 2 items that
   both continue lead with air, not with fire because a state reopened). When two events don't fit, the more newsworthy one is kept. The fire event is
   the fire states that are news (see Fire; a busy state within its usual range has no
   headline): "Fires climb in Gujarat for a third day, double the usual for late October";
   "Fires climb across western India, double the usual in Gujarat and Maharashtra"; "Fires
   ease back to seasonal levels across central India"; "Gujarat sees its busiest late-October
   fire day in three years"; otherwise "Fires stay above usual in Gujarat".
6. **Fire regions** come from where the states are: one or two states by name; one region
   ("across northern India"); states clustered round the middle of the country ("across
   central India"); two regions, always north to south ("across central and western
   India", "across western and southern India"); otherwise a count
   ("in four states"). The sea is named ("in the Bay of Bengal") only for a storm that has
   not crossed, and only when its mapped area is centred 150 km or more out at sea.
7. When nothing is above Level 1: "A quiet day across India, with nothing above minor."

Examples (the tests hold them):
- "Cyclone Arnab crosses the Andhra coast and weakens."
- "Fires climb in Chhattisgarh as air stays very poor in Panipat."
- "Air turns very poor in Panipat as fires climb in Chhattisgarh."
- "Gujarat sees its busiest late-October fire day in two years." (No. 17)
- "A major earthquake strikes 350 km outside India." (No. 14; the air clause would take it
  to fifteen words)
- "A quiet day across India, with nothing above minor."

## Where things are

From the item's coordinates only: the nearest point of an Indian state's coast, India's
outline for land, and coarse sea areas drawn well inside the water. "near the Andhra
Pradesh coast" (under 30 km), "in the Bay of Bengal, about 160 km off the Odisha coast",
"over land, about 120 km from the Odisha coast". Near another country's coast no sea is
named: "about 250 km from the West Bengal coast". The position is GDACS's, so the copy
says so, in its own sentence: "Global disaster monitors give it their highest alert, red,
with peak winds of 222 km/h. They place it near the Andhra Pradesh coast." When that
position is more than six hours older than the edition, the source line gives its time,
not the story. Never a forecast track, heading or landfall, and no latitude or longitude
in the copy or the evidence. An observed landfall (from edition 32) appears only in a
closed cyclone's line ("weakens after crossing the Andhra Pradesh coast") and in the item
page's evidence (district, state and time). Past editions show the location the item had
in that edition (plan P1, from edition 29); before edition 29, only when no later run
moved the item.

## Fire roundup

A journalist doesn't run five near-identical fire stories. All fire states are one desk
item, ranked at its highest state's level, with the states inside it in order of how far
above usual they are. The fire formula (see Fire) applies to the roundup title.

- **Easing first:** if more fire states fell back to Level 1 than rose since a day earlier
  (on a complete day), the roundup leads with it: "Fires ease back to seasonal levels across
  central India, Madhya Pradesh still above usual" / "Maharashtra, Uttar Pradesh, Telangana
  and Chhattisgarh fell back to seasonal levels since yesterday. Satellites picked up fires in
  21 Madhya Pradesh districts yesterday. That's about double what late October usually
  sees."
- **Title** otherwise: the states with news, as one clause: a record ("Chhattisgarh sees its
  busiest late-October fire day in two years"), a spread, or the direction with a region and
  the benchmark for the strongest ("Fires climb across western India, double the usual in
  Gujarat and Maharashtra"); with no news, where they stand ("Fires stay above usual across
  central India"). Next to a state's own story the roundup names no count of states. Never
  "led by …", "now including …", "up from four" or "the most in …". What is new since
  yesterday is Since yesterday's.
  **States all back near normal:** the roundup reads "Fires ease back to seasonal levels
  across central India" in the first edition that reports it and is not shown after that:
  those states appear in Since yesterday or drop off.
- **Standfirst,** two or three sentences, only about the states still above usual: the
  standout's sentences first (the record state, else the strongest mover, else the furthest
  above usual), then the others by name ("Telangana and Maharashtra are also above usual.").
  States that fell back are in Since yesterday, not here. No ranks and no cluster counts.
- **One state above usual:** the roundup reads as that state's own story.
- **State table** under it, as evidence: only the states still at Level 2 or above, each
  with its level squares (state, fires, usual a day, against past years: "busiest in 2
  years" or "within range"). A held state shows its dashed square; the Notes explain it.
  The exact cluster counts live here.
- **Own story:** a state gets its own story if it reaches Level 3 or above, or is the only
  fire state; the roundup then covers the rest. A record doesn't split a state out: it leads
  the roundup instead.

## Per category

| Category | Title | Standfirst | Source line |
|---|---|---|---|
| Fire (roundup) | "Chhattisgarh sees its busiest late-October fire day in two years" | "Satellites picked up fires in 10 Chhattisgarh districts on Monday. That's about nine times what late October usually sees. Telangana, Maharashtra, Madhya Pradesh and Uttar Pradesh are also above usual." | NASA FIRMS satellites |
| Fire (own story) | "Fires climb in Gujarat for a third day, double the usual for late October"; "Telangana fires dip after three-day surge, still above usual" | "Satellites picked up fires in 9 Telangana districts yesterday, down from 15 on Sunday. That's still about one and a half times what late October usually sees." | NASA FIRMS satellites (27 Oct incomplete: no data after 14:37 IST) |
| Air | "Air is very poor in Panipat and poor in 16 more cities"; "Air is poor in 23 cities, worst in Panipat" | "Panipat had the worst air in the country, with an index of 293, just short of 'very poor'. 22 other cities were rated poor." / "Baraut had the worst air in the country, with an index of 335, rated 'very poor'. Meerut and Gajraula were also rated very poor. 10 more cities were rated poor." | CPCB live data (unvalidated); Sentinel estimate from OpenAQ monitors |
| Cyclone | "Cyclone Arnab" | "Global disaster monitors give it their second-highest alert, orange, with winds of up to 102 km/h. They place it near the Andhra Pradesh coast. Its winds peaked at 222 km/h." (edition 32 on) / "Global disaster monitors give it their highest alert, red, with peak winds of 222 km/h. They place it near the Andhra Pradesh coast." (before 32: only the peak is known) | GDACS; GDACS (position as of 28 Oct, 11:30 IST) |
| Flood | "Flooding in India" | "Global disaster monitors give it their second-highest alert, orange." | GDACS |
| Earthquake | "Major earthquake strikes 350 km outside India"; Level 1s grouped: "Two small earthquakes strike near India's borders" | "The magnitude 7.0 quake struck 191 km from Nagqu, China, 18 km below the surface. The US Geological Survey's alert for likely impact is orange, the second-highest of four. Eight people reported feeling it." | USGS |

Quake strength words follow the USGS classes: light (4), moderate (5), strong (6),
major (7), great (8+); "small" for a group of Level 1 quakes.

## Since yesterday

Each line is the item's title, with the level change as small evidence ("Level 1 → 2").
Fire states and quakes with the same kind of change share one line, the roundup rule:
"Fires ease back to seasonal levels across central India"; "Fires climb above usual in
Gujarat and Telangana". A single state reads "Fires climb above usual in Chhattisgarh";
a state that fell but stays at Level 2 reads "Fires dip in Telangana, still above usual". Closed items say what happened,
from the closing rule: "Gujarat's fires have stayed down for two days"; "Two days have
passed since the major earthquake 350 km outside India"; "Global disaster monitors have
stopped tracking Cyclone Arnab"; "No city's air is poor any more". A closed cyclone reads
as news when its closing figures show it (edition 32 on; see Never say more than the
data): "Cyclone Arnab weakens after crossing the Andhra Pradesh coast", "Cyclone Arnab
weakens", "Cyclone Arnab crosses the Andhra Pradesh coast".

## The quiet desk

When nothing is above Level 1:
- **Headline:** "A quiet day across India, with nothing above minor." With a run of quiet
  days: "A quiet day across India, the third in a row, with nothing above minor"; two
  weeks: "A quiet fortnight across India, …".
- **Standfirst:** every category in one or two sentences, then what's worth watching: "No
  floods or cyclones are open. Fires are back to seasonal levels in four states, no
  earthquake of magnitude 4 or more has struck in or near India in two days and the worst
  air is poor, in 23 cities. One thing is worth watching." (Watching is said only on the
  latest edition.)
- **All clear:** a line per category: "None open.", "Poor in 23 cities, worst in Panipat
  at 293.", with the kicker over it ("As of Saturday", "Not updated") when a source didn't
  answer.
- **Watching:** "Panipat's air is close to very poor" / "Its air quality index is 293;
  very poor starts above 300." Rising: "… has risen for three reports toward very poor".
  Past the line: "Delhi's air reads severe".
- **Recently closed:** the item's name ("Gujarat's fires", "Magnitude 7.0 earthquake, 350
  km outside India"), then "peaked at Level 2 · open two days".

## The footer

The source line says what the ages mean: "Newest data at publication: Fire satellites
(FIRMS) 24 hours old · Earthquakes (USGS) no new events · Disaster alerts (GDACS) 1 hour
old · …". Each age is how old that source's newest observation was when the edition was
published.

## The late notice

Which source didn't answer, in words, and what that means: "NASA's fire satellites and the
global disaster monitors didn't answer this time, so cyclone, flood and fire news is as
last reported." (No. 19; categories in desk order.) A source that answered with nothing
"sent nothing this time". One that answered with a snapshot the pipeline did not use
"sent old data this time" or "sent partial data this time". These two are said, and shown
red, only when nothing covered for the category (air last-known); when OpenAQ set the air
item they are not a failure: no late notice, no red, and the phone wire does not count them
as late. The footer then shows a stale feed by the age of its snapshot ("26 hours old") and
an incomplete one as "partial data"; the Sources grid has its own "old data" and "partial
data" cells.
