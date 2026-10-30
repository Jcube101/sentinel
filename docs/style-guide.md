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
2. **Title:** a news headline with a verb, saying what happened. "Fires run above normal
   in five states, led by a spike in Chhattisgarh". A named event may stand on its name
   alone ("Cyclone Arnab"); then the standfirst carries the verb.
3. **Standfirst:** one to three sentences, each a fact said plainly. What happened first,
   then how it compares with the past. "Madhya Pradesh logged 145 fires yesterday across
   21 districts, about double the late-October average but normal for the season."
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
  - "· didn't answer this time" when the item is last-known.
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
events on 26 Oct, 9.07× the seasonal norm (3.0/day)", but "Chhattisgarh's fires jump to
nine times the usual".

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
past years (the baseline's busiest day at this time of year):
- above it: "spike to a two-year high for the season"; "far above normal" for a group
  that includes such a state. The standfirst then gives the multiple without repeating
  the verdict.
- level with it: "match their busiest day for the season".
- within the range: the plain multiple, nothing stronger: "Madhya Pradesh's fires run at
  twice the usual", "jump to six times the usual". The standfirst gives the same multiple
  against the average, with the verdict: "about double the late-October average but
  normal for the season". Never "well above normal" or "far above normal" next to "normal
  for the season".

A title carries at most one multiple; the evidence gives the exact ratio. Never "×"
outside the evidence.

### Words
| Not | But |
|---|---|
| fire events | fires |
| seasonal norm | the late-October average (standfirst); normal, the usual (titles) |
| ratio to norm | a multiple: "about nine times the late-October average" |
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
| M7.0 | magnitude 7.0 |

### Context from the past
Every fire count is measured against the same time of year in 2024–25 (the baseline
averages that week and the week either side). Say how unusual it is, closing the
state's sentence:
- More than the baseline's busiest day: "… and a two-year high for the season."
- Level with it: "… and level with its busiest day for the season in two years."
- Not more: "… but normal for the season."
- Never "more than any day in 2024": the baseline only covers this time of year.

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
Arnab holds at red alert as fires spread across central India" (No. 25). Not
"nothing in this report is above minor", but "A quiet day across India, with nothing above
minor". Closed items say what happened, not that they left a list: "Gujarat's fires have
stayed down for two days".

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
- "spreading": more states are above normal than in the edition a day earlier.
- "jump", "climb", "ease", "flare up again": the item is new, escalated, de-escalated or
  reopened since the edition a day earlier.
- "holds at red alert": the item was at the same level in the edition a day earlier.
- "fires ease": more fire states fell back than rose since a day earlier, on a complete
  day's counts. A day whose satellite data stops before the night pass (data before about
  18:00 UTC only) is incomplete: the source line says so, and the story claims no easing.
- "spike", "a two-year high for the season", "busiest in 2 years": the state's fires beat
  the baseline's busiest day at this time of year (2024–25).
- "the most of any state": the state's national rank by fires that day is 1, of every
  state with fires (plan P6, from edition 30). Said in its own sentence after the
  state's ("That was the most of any state."), or in the roundup's biggest-count sentence
  ("Madhya Pradesh had the most fires of any state, 200, …"). When another state had the
  same count, "tied for the most". Ranked lower, the roundup's biggest count "had the most
  fires of the states above normal". Editions before 30 have no rank: there "had the most
  fires" means the most of the states in the story, never "of any state".
- "the worst air in the country": the worst of the cities reporting to the board's
  national feed.
- A cyclone's "winds of up to 102 km/h": the latest advisory's wind (from edition 32).
  GDACS's own figure is the storm's peak, so without the latest wind (editions before 32,
  or a run that couldn't read the track) it is said as the peak: "peak winds of 222
  km/h". "Its winds peaked at 222 km/h." only when the peak is above the latest wind.
- A closed cyclone "weakens": its latest wind is below its peak; "after crossing the
  Andhra Pradesh coast": it made landfall, in that state (the first point over land
  after one at sea). Without either, the plain closing line.
- A neutral verb ("run at twice the usual") when nothing changed.

### Every line rebuilds for past editions
Templates read only the edition's own data: its snapshots, its run time and the
comparison with the edition a day earlier. Nothing from "now", so `/edition/:n` prints the
same words today as it would have when it was published. That includes the source line,
the kicker and the Notes.

## The page headline

One sentence: the lead item's news, then the next thing a reader should know, joined
with "as". No self-reference.
- "Cyclone Arnab holds at red alert as fires spread across central India." (No. 25)
- "Fires spread to four states, led by a spike in Gujarat." (No. 17)
- "A major earthquake strikes 350 km outside India as air turns very poor in three
  cities." (No. 14)
- "Cyclone Arnab holds at red alert as fires ease across central India." (No. 26, had its
  fire day been complete)

The lead is the first item (ranked by level, then cyclone, flood, earthquake, air, fire).
Its verb comes from the change since a day earlier: a cyclone or flood "holds at", "rises
to", "eases to" or "is back on" its alert colour; air "turns" or "eases to" a band; a
quake "strikes". Several fire states are one clause: "fires spread …", "fires ease …",
"fires run above normal …" ("far above normal" only with a record), led by the roundup's
angle when fires lead. The sea is named ("in the Bay of Bengal") only when the item's
mapped area is centred 150 km or more out at sea. Fire regions come from where the states
are: one region ("across northern India"); states clustered round the middle of the
country ("across central India"); two regions ("across western and southern India");
otherwise a count ("in four states"). When nothing is above Level 1: "A quiet day across
India, with nothing above minor."

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
above normal they are.

- **Easing first:** if more fire states fell back than rose since a day earlier (on a
  complete day), the roundup leads with it, and easing is its story: "Fires ease across
  central India, with Madhya Pradesh still above normal" / "Maharashtra, Uttar Pradesh,
  Telangana and Chhattisgarh fell back toward normal since yesterday. Madhya Pradesh
  logged 145 fires yesterday across 21 districts, about double the late-October average
  but normal for the season."
- **Title** otherwise: "Fires run above normal in N states, …", led by the strongest true
  angle, in this order:
  1. a record for the time of year: "led by a spike in Chhattisgarh"
  2. new since a day earlier: "now including Telangana"
  3. spreading, more states than a day earlier: "up from four"
  4. the largest count: "the most in Madhya Pradesh"
  5. the multiple of normal: "led by Chhattisgarh" (the multiple itself stays out)
- **Standfirst,** two or three sentences, only about the states still above normal: the
  standout (the state the angle names, else the furthest above normal) in one sentence,
  and "That was the most of any state." if it led every state; the biggest count, if that
  is another state ("Madhya Pradesh had the most fires of any state, 200, about three
  times the late-October average but normal for the season."); the others by name. States
  that fell back are in Since yesterday, not here. When easing leads, no rank sentence.
- **One state above normal:** the roundup reads as that state's own story ("Madhya
  Pradesh's fires run at twice the usual").
- **State table** under it, as evidence: only the states still at Level 2 or above, each
  with its level squares (state, fires, usual a day, against past years: "busiest in 2
  years" or "within range"). A held state shows its dashed square; the Notes explain it.
- **Own story:** a state gets its own story if it reaches Level 3 or above, or is the only
  fire state; the roundup then covers the rest ("Fires also run above normal in four more
  states"). A record doesn't split a state out: it leads the roundup instead.

## Per category

| Category | Title | Standfirst | Source line |
|---|---|---|---|
| Fire (roundup) | "Fires run above normal in five states, led by a spike in Chhattisgarh" | "Chhattisgarh logged 27 fires on Monday across 10 districts, about nine times the late-October average and a two-year high for the season. Madhya Pradesh had the most fires, 200, about three times the late-October average but normal for the season. Telangana, Maharashtra and Uttar Pradesh are also above normal." | NASA FIRMS satellites |
| Fire (own story) | "Telangana's fires run at six times the usual"; "Madhya Pradesh's fires run at twice the usual" | "Telangana logged 39 fires on Monday across 17 districts, about six times the late-October average but normal for the season." / "Madhya Pradesh logged 145 fires yesterday across 21 districts, about double the late-October average but normal for the season." | NASA FIRMS satellites (27 Oct incomplete: no data after 14:37 IST) |
| Air | "Air is very poor in Panipat and poor in 16 more cities"; "Air is poor in 23 cities, worst in Panipat" | "Panipat had the worst air in the country, with an index of 293, just short of 'very poor'. 22 other cities were rated poor." / "Baraut had the worst air in the country, with an index of 335, rated 'very poor'. Meerut and Gajraula were also rated very poor. 10 more cities were rated poor." | CPCB live data (unvalidated); Sentinel estimate from OpenAQ monitors |
| Cyclone | "Cyclone Arnab" | "Global disaster monitors give it their second-highest alert, orange, with winds of up to 102 km/h. They place it near the Andhra Pradesh coast. Its winds peaked at 222 km/h." (edition 32 on) / "Global disaster monitors give it their highest alert, red, with peak winds of 222 km/h. They place it near the Andhra Pradesh coast." (before 32: only the peak is known) | GDACS; GDACS (position as of 28 Oct, 11:30 IST) |
| Flood | "Flooding in India" | "Global disaster monitors give it their second-highest alert, orange." | GDACS |
| Earthquake | "Major earthquake strikes 350 km outside India"; Level 1s grouped: "Two small earthquakes strike near India's borders" | "The magnitude 7.0 quake struck 191 km from Nagqu, China, 18 km below the surface. The US Geological Survey's alert for likely impact is orange, the second-highest of four. Eight people reported feeling it." | USGS |

Quake strength words follow the USGS classes: light (4), moderate (5), strong (6),
major (7), great (8+); "small" for a group of Level 1 quakes.

## Since yesterday

Each line is the item's title, with the level change as small evidence ("Level 1 → 2").
Fire states and quakes with the same kind of change share one line, the roundup rule:
"Fires fall back toward normal in four states: Maharashtra, Uttar Pradesh, Telangana and
Chhattisgarh"; "Fires jump above normal in two states: Gujarat and Telangana". A single
state reads "Chhattisgarh's fires jump above normal". Closed items say what happened,
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
  floods or cyclones are open. Fires have fallen back toward normal in four states, no
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
"sent nothing this time".
