# Sentinel style guide

How the site writes. Every line the desk generates (the page headline, item titles and
standfirsts, Since yesterday, the late notice, the phone wire) follows this guide. The
templates live in `frontend/src/lib/desk/copy.ts` and `words.ts`; tests in `copy.test.ts`
hold the examples below to the letter.

## Who we write for

Ordinary readers in India who want to know whether anything dangerous is happening, and
how unusual it is. They don't know what FIRMS, GDACS or an AQI sub-index is, and they
shouldn't need to. Write like a news report, not a database.

## The shape of an item

1. **Title:** a news headline with a verb, saying what happened. "Fires run above normal
   in five states, led by a spike in Chhattisgarh". A named event may stand on its name
   alone ("Cyclone Arnab"); then the standfirst carries the verb.
2. **Standfirst:** one to three sentences. What happened first, then the measurement as
   evidence, then context from the past. "Chhattisgarh, newly above normal, had 27 fires
   on Monday, about nine times usual for late October and more than on any day at this
   time of year in 2024 or 2025."
3. **Evidence**, set smaller and quieter under the story: the figures strip or state
   table, the exact rule that set the level ("Level from: …"), links to the source's own
   page. Exact numbers, source names and technical terms belong here, not in the story.

## Rules

### Lead with what happened
Say what is happening in plain English, then give the number that shows it. Not "27 fire
events on 26 Oct, 9.07× the seasonal norm (3.0/day)", but "Chhattisgarh's fires jump to
nine times normal".

### Translate and round numbers
| In the data | In the story |
|---|---|
| 9.07× the norm | about nine times usual (standfirst only) |
| 2.1× | about twice the usual |
| 1.5× | one and a half times usual |
| norm 2.98 a day | about 3 |
| norm 68.7 a day | about 70 (nearest 5 under 100, nearest 10 above) |
| 347.9 km | about 350 km (nearest 5 under 100 km, nearest 10 above) |
| 222.2 km/h | 222 km/h (measurements keep their figure) |

- Multiples are words ("three times"); 20 and over round to the nearest 5.
- Spell out one to nine for counts of places and people ("four states", "six cities",
  "nine districts", "eight people", "two small earthquakes"); 10 and up in figures.
- Fires and readings are measurements: always figures ("27 fires", "about 3",
  "an index of 301", "222 km/h").
- No × signs, decimals or units in titles and standfirsts, except wind speed, depth and
  distance, which readers know.

### No multiples in titles
The "times usual" figure appears at most once per story, in the standfirst, and never in
a title, the page headline or a Since yesterday line. Titles say what happened ("spike",
"jump above normal", "run well above normal"); the standfirst gives the multiple; the
evidence gives the exact ratio.

### Words
| Not | But |
|---|---|
| fire events | fires |
| seasonal norm | usual for this time of year; normal (titles) |
| ratio to norm | a multiple, in the standfirst: "about nine times usual" |
| AQI | India's air quality index (first mention), then the index |
| CPCB | the Central Pollution Control Board (first mention), then the board |
| unvalidated | live readings, before the board's own checks; label: Provisional |
| approximate (OpenAQ fallback) | Sentinel's estimate from public monitors; label: Estimate |
| GDACS | global disaster monitors |
| USGS | the US Geological Survey |
| PAGER alert | its alert for likely impact |
| FIRMS | NASA's fire satellites |
| last-known | not updated in this report; these are the last figures we had |
| capped at L2 pending calibration | held at Level 2 for now |
| fetch failed / timed out | didn't answer |
| M7.0 | magnitude 7.0 |

### Context from the past
Every fire count is measured against the same time of year in 2024–25 (the baseline
averages that week and the week either side). Say how unusual it is:
- More than the baseline's busiest day: "That's more than on any day at this time of
  year in 2024 or 2025."
- Not more: "That's within its range for the season", or "though still within its range
  for the season".
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
"yesterday". Months are told by thirds: early, mid-, late October.

### Explain sources in words on first mention
"Global disaster monitors give it their highest alert, red", not "GDACS Red alert".
"according to the US Geological Survey". The source's own abbreviation stays in the
evidence.

### Never say more than the data
No landfall or track forecasts, no causes (crop burning, stubble), no land cover (farmland,
forest) unless an alert says so, no casualties or damage. A source's own alert can be
reported as theirs ("its alert for likely impact is orange"); a claim of our own needs a
figure behind it:
- "spreading": more states are above normal than in the edition a day earlier.
- "jump", "climb", "ease", "flare up again", "newly above normal": the item is new,
  escalated, de-escalated or reopened since the edition a day earlier.
- "spike", "a two-year high for the season", "busiest in 2 years": the state's fires beat
  the baseline's busiest day at this time of year (2024–25).
- "had the most": the most of the states in the story. Never "of any state": an edition
  only holds the states on the desk, until the pipeline stores each state's national rank
  (plan P6).
- A neutral verb ("run well above normal") when nothing changed.

### Every line rebuilds for past editions
Templates read only the edition's own data: its snapshots, its run time and the
comparison with the edition a day earlier. Nothing from "now", so `/edition/:n` prints the
same words today as it would have when it was published.

## The page headline

One sentence: the top story, then the next thing a reader should know.
- "A severe cyclone is the top story today, and fires are spreading across central
  India." (No. 25)
- "Fires are the top story today, spreading to four states, led by a spike in Gujarat."
  (No. 17)
- "A major earthquake 350 km outside India is the top story today, and air is very poor
  in three cities." (No. 14)

The top story is the first item on the desk (ranked by level, then cyclone, flood,
earthquake, air, fire). Several fire states at the top level are one story: "fires". The
level sets the adjective: severe (4), strong or serious (3). Fire regions come from where
the states are: one region ("across northern India"); states clustered round the middle
of the country ("across central India"); two regions ("across western and southern
India"); otherwise a count ("in four states"). When nothing is above Level 1: "A quiet
day: nothing in this report is above minor."

## Fire roundup

A journalist doesn't run five near-identical fire stories. All fire states are one desk
item, ranked at its highest state's level, with the states inside it in order of how far
above normal they are.

- **Title:** "Fires run above normal in N states, …", led by the strongest true angle, in
  this order:
  1. a record for the time of year: "led by a spike in Chhattisgarh"
  2. new on the desk since a day earlier: "now including Telangana"
  3. spreading, more states than a day earlier: "up from four"
  4. the largest count: "the most in Madhya Pradesh"
  5. the multiple of normal: "led by Chhattisgarh" (the multiple itself stays out)
- **Standfirst,** two or three sentences: the standout (the state the angle names, else
  the furthest above normal) with its count and its multiple, once; the biggest count, if
  that is another state, with how it compares with past years; the others by name.
- **State table** under it, as evidence: state, fires, usual a day, against past years
  ("busiest in 2 years" or "within range"); a held state is starred.
- **Own story:** a state gets its own story if it reaches Level 3 or above, or is the only
  fire state; the roundup then covers the rest ("Fires also run above normal in four more
  states"). A record doesn't split a state out: it leads the roundup instead.

## Per category

| Category | Title | Standfirst |
|---|---|---|
| Fire (roundup) | "Fires run above normal in five states, led by a spike in Chhattisgarh" | "Chhattisgarh, newly above normal, had 27 fires on Monday, about nine times usual for late October and more than on any day at this time of year in 2024 or 2025. Madhya Pradesh had the most, with 200, though that's within its range for the season. Telangana, Maharashtra and Uttar Pradesh are also above normal." |
| Fire (own story) | "Telangana's fires run well above normal"; "Chhattisgarh's fires spike to a two-year high for the season" | "39 fires on Monday across 17 districts, about six times usual for late October. That's within its range for the season." |
| Air | "Air is very poor in Panipat and poor in 16 more cities"; "Air is poor in six cities, worst in Khairthal" | "Panipat, in Haryana, is worst, at 301 on India's air quality index, which the Central Pollution Control Board rates very poor. 16 more cities are poor, out of 267 reporting. These are the board's live readings, before its own checks." |
| Cyclone | "Cyclone Arnab" | "Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h." |
| Flood | "Flooding in India" | "Global disaster monitors give it their second-highest alert, orange." |
| Earthquake | "Major earthquake strikes 350 km outside India"; Level 1s grouped: "Two small earthquakes strike near India's borders" | "The magnitude 7.0 quake struck 191 km from Nagqu, China, 18 km below the surface, according to the US Geological Survey. Its alert for likely impact is orange, the second-highest of four." |

Quake strength words follow the USGS classes: light (4), moderate (5), strong (6),
major (7), great (8+); "small" for a group of Level 1 quakes.

## Since yesterday

Each line is the item's title, with the level change as small evidence ("Level 1 → 2").
Fire states get a line each, in words: "Chhattisgarh's fires jump above normal",
"Maharashtra's fires flare up again". Closed items say why they left, from the closing
rule: "Gujarat's fires drop off the list after two quieter days"; "The major earthquake 350 km outside India leaves the report
after two days"; "Cyclone Arnab is off the global disaster monitors' list"; "No city's air
is poor any more".

## The late notice

Which source didn't answer, in words, and what that means: "NASA's fire satellites and the
global disaster monitors didn't answer this time, so fire, cyclone and flood news is as
last reported."
