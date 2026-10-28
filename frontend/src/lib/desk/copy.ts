// The desk's words: page headline, item titles and standfirsts, Since
// yesterday lines. Rules and examples: docs/style-guide.md.
//
// Built only from the edition's own data (snapshot figures, its run time and
// the comparison with the edition a day earlier), so an archived edition
// reads as it did when it was published.

import { worstCities } from './cards'
import { counted, snapshotEntry, type DeskEntry } from './entries'
import type { MoveKind, Movement, SinceYesterday } from './changes'
import { LEVEL_NAMES } from './levels'
import { SCALE } from './scale'
import type { AirBand, AirCity, Category, CategoryStatus, Edition, Level, TimedSnapshot, WatchRow } from './types'
import { CATEGORY_ORDER } from './entries'
import { SOURCE_NAMES } from './sources'
import { istDay } from './ist'
import { placeOf, placeText } from './where'
import { asOfKicker, fireDayCutOff } from './notes'
import {
  SOURCE_WORDS,
  alertRank,
  alertRankWord,
  cap,
  listText,
  numberWord,
  partOfMonth,
  possessive,
  quakeStrength,
  relativeDay,
  roundKm,
  theUsual,
  timesAverage,
  whereStates,
} from './words'

export interface ItemCopy {
  title: string
  /** One or two sentences under the title; null for compact Level 1 rows. */
  standfirst: string | null
}

export interface CopyContext {
  /** The edition's start time: "today" and "yesterday" are relative to it. */
  editionAt: string
  since: SinceYesterday | null
  /** Fire states at Level 2 and up (in the roundup or on their own), highest ratio first. */
  fires: DeskEntry[]
  /** Fire states with their own story (Level 3+, or the only fire state). */
  ownFires: DeskEntry[]
}

const BAND_WORDS: Record<AirBand, string> = { poor: 'poor', very_poor: 'very poor', severe: 'severe' }

/** A measured count, always in figures: "27 fires", "1 fire". */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** A count of places or people, spelled out under 10: "six cities", "10 districts". */
function counted_(n: number, one: string, many: string): string {
  return `${numberWord(n)} ${n === 1 ? one : many}`
}

export function copyContext(entries: DeskEntry[], since: SinceYesterday | null, run: Pick<Edition, 'started_at'>): CopyContext {
  const fireRows = entries.filter((e) => e.category === 'fire')
  const states = fireRows.flatMap((e) => (e.members.length > 0 ? e.members : [e]))
  return {
    editionAt: run.started_at,
    since,
    fires: states.filter((e) => e.level >= 2).sort((a, b) => b.strength - a.strength),
    ownFires: fireRows.filter((e) => e.members.length === 0),
  }
}

// --- fire ----------------------------------------------------------------------------

interface NearFire {
  place?: string
  km?: number
  district?: string
}

interface WildfireAlert {
  alert_level?: string
}

/** One state's fire figures, read the same way by every template. */
interface StateFacts {
  state: string
  n: number
  districts: number
  /** "on Monday", "yesterday" (relative to the edition) */
  day: string
  /** "late October" */
  period: string
  r: number | null
  /** Enough fires for the ratio to set the level. */
  counted: boolean
  /** The day against the baseline's busiest day at this time of year. */
  record: 'above' | 'equal' | 'within' | null
  /** How many years the baseline covers: 2 for 2024–2025. */
  span: number
}

/** How many years the fire baseline covers: 2 for "2024-2025". */
function baselineYears(e: DeskEntry): number {
  const [a, b] = String(e.figures.norm_years ?? SCALE.fire.baselineYears)
    .split(/[-–]/)
    .map(Number)
  return b ? b - a + 1 : 1
}

function stateFacts(e: DeskEntry, ctx: CopyContext): StateFacts {
  const f = e.figures
  const n = f.fire_events ?? 0
  const r = typeof f.ratio_to_norm === 'number' ? f.ratio_to_norm : null
  const max = typeof f.norm_max_daily_events === 'number' ? f.norm_max_daily_events : null
  return {
    state: typeof f.state === 'string' ? f.state : e.title,
    n,
    districts: f.district_count ?? 0,
    day: f.day ? relativeDay(f.day, ctx.editionAt) : '',
    period: f.day ? partOfMonth(f.day) : 'this time of year',
    r,
    counted: r !== null && n >= SCALE.fire.minFireEvents,
    record: max === null ? null : n > max ? 'above' : n === max ? 'equal' : 'within',
    span: baselineYears(e),
  }
}

/**
 * The verdict against past years, closing a state sentence: " but normal for
 * the season", " and a two-year high for the season".
 */
function verdictClause(f: StateFacts): string {
  if (f.record === 'above') return ` and a ${numberWord(f.span)}-year high for the season`
  if (f.record === 'equal') return ` and level with its busiest day for the season in ${numberWord(f.span)} years`
  if (f.record === 'within') return ' but normal for the season'
  return ''
}

/**
 * A state's fires in one sentence, said plainly (style guide): "Madhya
 * Pradesh logged 145 fires yesterday across 21 districts, about double the
 * late-October average but normal for the season."
 */
function stateSentence(f: StateFacts, verdict = true): string {
  if (f.n === 0) return `NASA's fire satellites saw no fires in ${f.state} ${f.day}.`
  const across = f.districts > 0 ? ` across ${counted_(f.districts, 'district', 'districts')}` : ''
  const vs = f.counted && f.r !== null ? `, ${timesAverage(f.r, f.period)}${verdict ? verdictClause(f) : ''}` : ''
  return `${f.state} logged ${plural(f.n, 'fire', 'fires')} ${f.day}${across}${vs}.`
}

/** The roundup's biggest count, when another state leads: "Madhya Pradesh had the most fires, 200, …". */
function mostSentence(f: StateFacts): string {
  const vs = f.counted && f.r !== null ? `, ${timesAverage(f.r, f.period)}${verdictClause(f)}` : ''
  return `${f.state} had the most fires, ${f.n}${vs}.`
}

/** Fire states that fell a level since yesterday, and how many rose. */
function fireMoves(ctx: CopyContext): { fell: Movement[]; rose: number } {
  const moves = (ctx.since?.moves ?? []).filter((m) => m.category === 'fire')
  return {
    fell: moves.filter((m) => m.kind === 'deescalated'),
    rose: moves.filter((m) => m.kind === 'new' || m.kind === 'reopened' || m.kind === 'escalated').length,
  }
}

/**
 * The easing angle: more fire states fell back than rose since yesterday.
 * Not on an incomplete day: a drop there may be data that hasn't arrived.
 */
function fireEasing(ctx: CopyContext): string[] | null {
  const { fell, rose } = fireMoves(ctx)
  if (fell.length === 0 || fell.length <= rose) return null
  const anyFire = ctx.fires[0] ?? ctx.ownFires[0] ?? fell.map((m) => snapshotEntry(m.snapshot))[0]
  if (anyFire && fireDayCutOff(anyFire)) return null
  return fell.map((m) => String(m.snapshot.figures?.state ?? m.itemId))
}

/**
 * A state's story title: what happened, with intensity words that match the
 * verdict against past years (style guide). A record "spikes"; within the
 * range the title gives the plain multiple ("run at twice the usual"), and
 * then the standfirst gives the usual count instead.
 */
function stateTitle(e: DeskEntry, ctx: CopyContext): string {
  const f = stateFacts(e, ctx)
  const S = possessive(f.state)
  if (f.record === 'above' && f.counted) return `${S} fires spike to a ${numberWord(f.span)}-year high for the season`
  if (f.record === 'equal' && f.counted) return `${S} fires match their busiest day for the season`
  const usual = f.counted && f.r !== null ? theUsual(f.r) : null
  switch (e.change) {
    case 'opened':
      return usual ? `${S} fires jump to ${usual}` : `${S} fires jump above normal`
    case 'reopened':
      return usual ? `${S} fires flare up again, to ${usual}` : `${S} fires flare up again`
    case 'escalated':
      return usual ? `${S} fires climb to ${usual}` : `${S} fires climb further above normal`
    case 'deescalated':
      return e.level >= 2 && usual ? `${S} fires ease to ${usual}` : `${S} fires fall back toward normal`
  }
  if (e.level === 1) return `${S} fires have fallen back toward normal`
  return usual ? `${S} fires run at ${usual}` : `${S} fires run above normal`
}

/** A state's own story: the news in the title, the count and how it compares in the standfirst. */
function fireStateCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const ff = e.figures
  const f = stateFacts(e, ctx)
  const near = (Array.isArray(ff.large_fires_near_people) ? ff.large_fires_near_people[0] : undefined) as NearFire | undefined
  const wildfire = (Array.isArray(ff.gdacs_wildfire) ? ff.gdacs_wildfire[0] : undefined) as WildfireAlert | undefined

  if (near?.place) {
    const where = near.district ? ` in ${near.district} district` : ''
    return {
      title: `A large fire burns ${Math.max(1, Math.round(near.km ?? 0))} km from ${near.place}`,
      standfirst:
        `NASA's fire satellites picked up a large fire${where}, close to a town of ${SCALE.fire.level4MinPopulation.toLocaleString('en-IN')} people or more. ` +
        stateSentence(f),
    }
  }
  if (wildfire && (!f.counted || (ff.gdacs_level ?? 0) > (ff.ratio_level ?? 0))) {
    const colour = (wildfire.alert_level ?? '').toLowerCase()
    return {
      title: `Global monitors put a forest fire in ${f.state} on alert`,
      standfirst: `Global disaster monitors have a ${colour ? `${colour} ` : ''}forest-fire alert in ${f.state}. ${stateSentence(f)}`,
    }
  }
  if (f.n === 0) return { title: `Satellites see no fires in ${f.state}`, standfirst: stateSentence(f) }
  if (!f.counted) return { title: `${f.state} is down to ${plural(f.n, 'fire', 'fires')}`, standfirst: stateSentence(f) }
  // A record title already gives the verdict; the standfirst doesn't repeat it.
  const recordTitle = f.record === 'above' || f.record === 'equal'
  return { title: stateTitle(e, ctx), standfirst: stateSentence(f, !recordTitle) }
}

type AngleKind = 'record' | 'new' | 'spreading' | 'largest' | 'multiple'

interface Angle {
  kind: AngleKind
  /** The states the angle names, strongest first. */
  states: DeskEntry[]
  /** Spreading: how many states were above normal a day earlier. */
  before: number
}

/** Fire states above normal in the edition a day earlier, or null without the comparison. */
function firesBefore(ctx: CopyContext): number | null {
  const ref = ctx.since?.refLevels
  if (!ref || !ctx.since?.ref) return null
  return [...ref].filter(([id, level]) => id.startsWith('fire:') && level >= 2).length
}

/**
 * The strongest true angle on a set of fire states (style guide, Fire
 * roundup): a record for the time of year, then new on the desk, then
 * spreading, then the largest count, then the multiple of normal.
 */
function fireAngle(states: DeskEntry[], ctx: CopyContext, spreadingAllowed: boolean): Angle {
  const facts = new Map(states.map((e) => [e.key, stateFacts(e, ctx)]))
  const records = states.filter((e) => facts.get(e.key)!.record === 'above' && facts.get(e.key)!.counted)
  if (records.length > 0) return { kind: 'record', states: records, before: 0 }
  const news = states.filter((e) => isNewChange(e))
  if (news.length > 0) return { kind: 'new', states: news, before: 0 }
  const before = firesBefore(ctx)
  if (spreadingAllowed && before !== null && ctx.fires.length > before) return { kind: 'spreading', states: [], before }
  const byCount = [...states].sort((a, b) => facts.get(b.key)!.n - facts.get(a.key)!.n)
  if (byCount.length >= 2 && facts.get(byCount[0].key)!.n > facts.get(byCount[1].key)!.n) {
    return { kind: 'largest', states: [byCount[0]], before: 0 }
  }
  return { kind: 'multiple', states: [states[0]], before: 0 }
}

function isNewChange(e: DeskEntry): boolean {
  return e.change === 'opened' || e.change === 'reopened'
}

function stateName(e: DeskEntry): string {
  return String(e.figures.state ?? e.title)
}

/** "led by a spike in Chhattisgarh", "now including Telangana", "up from four" */
function angleSuffix(a: Angle): string {
  const names = a.states.map(stateName)
  switch (a.kind) {
    case 'record':
      if (names.length === 1) return `led by a spike in ${names[0]}`
      return names.length === 2 ? `led by spikes in ${listText(names)}` : `with spikes in ${numberWord(names.length)} of them`
    case 'new':
      return names.length <= 2 ? `now including ${listText(names)}` : `${numberWord(names.length)} of them new`
    case 'spreading':
      return `up from ${a.before === 0 ? 'none' : numberWord(a.before)}`
    case 'largest':
      return `the most in ${names[0]}`
    case 'multiple':
      return `led by ${names[0]}`
  }
}

/**
 * The fire roundup: one story for the fire states, led by the strongest
 * angle. Only the states still above normal are in it; those that fell back
 * are in Since yesterday, unless easing is the story.
 */
function roundupCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const above = e.members.filter((x) => x.level >= 2)
  const eased = fireEasing(ctx)

  if (eased) {
    // Lead with easing (style guide, Fire roundup): the states that fell back, then those still above.
    const aboveNames = above.map(stateName)
    const title = `Fires ease ${whereStates(eased).inText}` + (aboveNames.length > 0 ? `, with ${listText(aboveNames)} still above normal` : '')
    const sentences = [`${listText(eased)} fell back toward normal since yesterday.`]
    if (above.length > 0) sentences.push(stateSentence(stateFacts(above[0], ctx)))
    const others = above.slice(1).map(stateName)
    if (others.length > 0) sentences.push(`${listText(others)} ${others.length === 1 ? 'is' : 'are'} also still above normal.`)
    return { title, standfirst: sentences.join(' ') }
  }

  if (above.length === 0) {
    const names = e.members.map(stateName)
    return {
      title: `Fires fall back toward normal in ${counted_(names.length, 'state', 'states')}`,
      standfirst: `${listText(names)} ${names.length === 1 ? 'has' : 'have'} fallen back toward normal.`,
    }
  }
  if (above.length === 1) return fireStateCopy(above[0], ctx)

  const also = ctx.ownFires.some((x) => x.level >= 2)
  const angle = fireAngle(above, ctx, !also)
  const base = also
    ? `Fires also run above normal in ${counted_(above.length, 'more state', 'more states')}`
    : `Fires run above normal in ${counted_(above.length, 'state', 'states')}`
  const title = `${base}, ${angleSuffix(angle)}`

  // The standout: the state the angle names, else the furthest above normal.
  const standout = angle.kind === 'record' || angle.kind === 'new' ? angle.states[0] : above[0]
  const sentences = [stateSentence(stateFacts(standout, ctx))]
  const byCount = [...above].sort((a, b) => stateFacts(b, ctx).n - stateFacts(a, ctx).n)
  const biggest = byCount[0] !== standout && stateFacts(byCount[0], ctx).n > stateFacts(byCount[1], ctx).n ? byCount[0] : null
  if (biggest) sentences.push(mostSentence(stateFacts(biggest, ctx)))
  const others = above.filter((x) => x !== standout && x !== biggest).map(stateName)
  if (others.length > 0) sentences.push(`${listText(others)} ${others.length === 1 ? 'is' : 'are'} also above normal.`)
  return { title, standfirst: sentences.join(' ') }
}

/** A fire state's Since yesterday line: the move in words. */
function fireMoveText(m: Movement, e: DeskEntry): string {
  const S = possessive(stateName(e))
  switch (m.kind) {
    case 'new':
      return `${S} fires jump above normal`
    case 'reopened':
      return `${S} fires flare up again`
    case 'escalated':
      return `${S} fires climb further above normal`
    case 'deescalated':
      return (m.to ?? 1) >= 2 ? `${S} fires ease but stay above normal` : `${S} fires fall back toward normal`
    case 'closed':
      return `${S} fires have stayed down for two days`
  }
}

// --- air -----------------------------------------------------------------------------

type AirMetric = 'aqi' | 'pm25' | 'pm10'

const NEXT_BAND: Partial<Record<AirBand, { band: AirBand; above: (m: AirMetric) => number }>> = {
  poor: { band: 'very_poor', above: (m) => SCALE.air[m].veryPoorAbove },
  very_poor: { band: 'severe', above: (m) => SCALE.air[m].severeAbove },
}

/**
 * The worst city's reading against the bands: "rated 'very poor'", "just
 * short of 'very poor'" (within 5% of it), or, for a Severe reading not yet
 * confirmed, "past the 'severe' line in the latest report".
 */
function bandPhrase(v: number, city: AirCity, metric: AirMetric): string {
  const band = counted(city)
  const next = NEXT_BAND[band]
  if (next && v > next.above(metric)) return `past the '${BAND_WORDS[next.band]}' line in the latest report`
  if (next && v >= next.above(metric) * 0.95) return `just short of '${BAND_WORDS[next.band]}'`
  return `rated '${BAND_WORDS[band]}'`
}

function airCopy(e: DeskEntry): ItemCopy {
  const f = e.figures
  const worst = worstCities(f)
  if (worst.length === 0) return { title: e.title, standfirst: null }
  const top = counted(worst[0])
  const inTop = worst.filter((c) => counted(c) === top)
  const c = f.counts ?? {}
  const where = inTop.length === 1 ? inTop[0].city : counted_(inTop.length, 'city', 'cities')

  let title: string
  if (top === 'poor') {
    title = inTop.length === 1 ? `Air is poor in ${where}` : `Air is poor in ${where}, worst in ${worst[0].city}`
  } else if (top === 'very_poor') {
    const poor = c.poor ?? 0
    title = `Air is very poor in ${where}` + (poor > 0 ? ` and poor in ${counted_(poor, 'more city', 'more cities')}` : '')
  } else {
    const rest = (c.very_poor ?? 0) + (c.poor ?? 0)
    title = `Air is severe in ${where}` + (rest > 0 ? ` and poor or worse in ${counted_(rest, 'more city', 'more cities')}` : '')
  }

  // One fact per sentence: the worst city, then the rest by band (style guide, Air).
  const w = worst[0]
  const sentences: string[] = []
  if (typeof w.aqi === 'number') {
    sentences.push(`${w.city} had the worst air in the country, with an index of ${w.aqi}, ${bandPhrase(w.aqi, w, 'aqi')}.`)
  } else {
    const pm25 = typeof w.pm25_24h === 'number'
    const v = Math.round((pm25 ? w.pm25_24h : w.pm10_24h) ?? 0)
    const what = pm25 ? 'fine particles (PM2.5)' : 'coarse dust (PM10)'
    sentences.push(`${w.city} had the worst air in the country, with ${what} averaging ${v} µg/m³ over a day, ${bandPhrase(v, w, pm25 ? 'pm25' : 'pm10')}.`)
  }
  const alsoTop = inTop.slice(1)
  if (alsoTop.length > 0 && alsoTop.length <= 2) {
    sentences.push(`${listText(alsoTop.map((x) => x.city))} ${alsoTop.length === 1 ? 'was' : 'were'} also rated ${BAND_WORDS[top]}.`)
  } else if (alsoTop.length > 2) {
    sentences.push(`${cap(counted_(alsoTop.length, 'other city was', 'other cities were'))} rated ${BAND_WORDS[top]}.`)
  }
  const lower: AirBand[] = top === 'severe' ? ['very_poor', 'poor'] : top === 'very_poor' ? ['poor'] : []
  for (const b of lower) {
    const k = c[b] ?? 0
    if (k === 0) continue
    const word = sentences.length === 1 ? 'other' : 'more'
    sentences.push(`${cap(counted_(k, `${word} city was`, `${word} cities were`))} rated ${BAND_WORDS[b]}.`)
  }
  return { title, standfirst: sentences.join(' ') }
}

// --- earthquakes ---------------------------------------------------------------------

interface QuakePlace {
  /** "191 km from Nagqu, China", or the USGS place as given. */
  phrase: string | null
  town: string | null
  km: number | null
}

function quakePlace(place: string | null): QuakePlace {
  if (!place) return { phrase: null, town: null, km: null }
  const m = /^(\d+(?:\.\d+)?) km [NSEW]{1,3} of (.+)$/.exec(place)
  if (m) return { phrase: `${Math.round(Number(m[1]))} km from ${m[2]}`, town: m[2], km: Number(m[1]) }
  return { phrase: `near ${place}`, town: null, km: null }
}

/** Where a quake was, for titles: "350 km outside India", "near Shillong", "in India". */
function quakeWhere(e: DeskEntry): string {
  const f = e.figures
  if (f.in_india) {
    const p = quakePlace(e.placeName)
    return p.town && p.km !== null && p.km <= 30 ? `near ${p.town.replace(/, India$/, '')}` : 'in India'
  }
  if (typeof f.km_from_india !== 'number') return 'near India'
  return f.km_from_india < 10 ? 'just outside India' : `${roundKm(f.km_from_india)} km outside India`
}

function quakeCopy(e: DeskEntry): ItemCopy {
  const f = e.figures
  const m = f.magnitude ?? e.strength
  const p = quakePlace(e.placeName)
  const depth = typeof f.depth_km === 'number' ? `, ${Math.round(f.depth_km)} km below the surface` : ''
  const parts = [`The magnitude ${m.toFixed(1)} quake struck ${p.phrase ?? quakeWhere(e)}${depth}.`]
  if (f.usgs_alert) {
    const rank = alertRankWord(f.usgs_alert)
    parts.push(`The US Geological Survey's alert for likely impact is ${f.usgs_alert.toLowerCase()}${rank ? `, the ${rank} of four` : ''}.`)
  }
  if (typeof f.felt_reports === 'number' && f.felt_reports > 0) {
    parts.push(`${cap(counted_(f.felt_reports, 'person', 'people'))} reported feeling it.`)
  }
  if (f.tsunami) parts.push('It is flagged as an undersea quake that could cause a tsunami.')
  return { title: `${cap(quakeStrength(m))} earthquake strikes ${quakeWhere(e)}`, standfirst: parts.join(' ') }
}

/** A grouped quake's line: "Magnitude 4.6, 91 km from Tuensang, India". */
export function quakeMemberLine(e: DeskEntry): string {
  const m = e.figures.magnitude ?? e.strength
  const p = quakePlace(e.placeName)
  return `Magnitude ${m.toFixed(1)}, ${p.phrase ?? quakeWhere(e)}`
}

function quakeGroupCopy(e: DeskEntry): ItemCopy {
  const anyIn = e.members.some((x) => x.figures.in_india)
  return {
    title: `${cap(numberWord(e.members.length))} small earthquakes strike ${anyIn ? 'in and near India' : "near India's borders"}`,
    standfirst: null,
  }
}

// --- floods and cyclones -------------------------------------------------------------

const NUMBER_NAMES =
  /^(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY.*|\d+[A-Z]?)$/i

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

/** "Tropical Cyclone ARNAB-26" → "Cyclone Arnab"; a numbered one → "An unnamed tropical cyclone". */
export function cycloneName(title: string): string {
  const m = /^Tropical Cyclone\s+(.+?)(?:-\d{2})?$/i.exec(title.trim())
  if (!m) return title.replace(/-\d{2}$/, '')
  return NUMBER_NAMES.test(m[1]) ? 'An unnamed tropical cyclone' : `Cyclone ${titleCase(m[1])}`
}

/** "Flood in India" → "Flooding in India". */
function floodName(e: DeskEntry): string {
  const m = /^Floods?\s+in\s+(.+)$/i.exec(e.title.trim())
  if (m) return `Flooding in ${m[1]}`
  return e.placeName ? `Flooding in ${e.placeName}` : e.title
}

const COLOUR_RANK: Record<string, number> = { green: 1, orange: 2, red: 3 }

function gdacsStandfirst(e: DeskEntry, cyclone: boolean): string {
  const f = e.figures
  const now = String(f.episode_alert_level ?? f.alert_level ?? '').toLowerCase()
  const peak = String(f.alert_level ?? '').toLowerCase()
  const wind =
    cyclone && typeof f.severity === 'number' && f.severity > 0 && f.severity_unit === 'km/h'
      ? `, with winds of up to ${Math.round(f.severity)} km/h`
      : ''
  // Where GDACS places the event (its point is the centre of the area it maps, not a track).
  let s = `Global disaster monitors give it ${alertRank(now, 'their')}${wind}.`
  if (e.coords) s += ` They place it ${placeText(placeOf(e.coords[0], e.coords[1]))}.`
  if (f.rising) s += ' Its alert score went up in their latest update.'
  if ((COLOUR_RANK[peak] ?? 0) > (COLOUR_RANK[now] ?? 0)) s += ` It was rated ${peak} earlier.`
  return s
}

/** A name at the start of a clause in mid-sentence: "an unnamed tropical cyclone", "flooding in Assam". */
function midName(name: string): string {
  return /^(An|A|Flooding) /.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name
}

// --- items ---------------------------------------------------------------------------

/** The title and standfirst for one desk row. */
export function itemCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  if (e.members.length > 0) return e.category === 'fire' ? roundupCopy(e, ctx) : quakeGroupCopy(e)
  switch (e.category) {
    case 'fire':
      return fireStateCopy(e, ctx)
    case 'air':
      return airCopy(e)
    case 'earthquake':
      return quakeCopy(e)
    case 'cyclone':
      return { title: cycloneName(e.title), standfirst: gdacsStandfirst(e, true) }
    case 'flood':
      return { title: floodName(e), standfirst: gdacsStandfirst(e, false) }
  }
}

/** Why a closed item left, from its closing rule. */
export function closedLine(e: DeskEntry): string {
  switch (e.category) {
    case 'fire':
      return `${possessive(stateName(e))} fires have stayed down for two days`
    case 'earthquake':
      return `Two days have passed since the ${quakeStrength(e.figures.magnitude ?? e.strength)} earthquake ${quakeWhere(e)}`
    case 'cyclone':
      return `Global disaster monitors have stopped tracking ${midName(cycloneName(e.title))}`
    case 'flood':
      return `Global disaster monitors have stopped tracking ${midName(floodName(e))}`
    case 'air':
      return "No city's air is poor any more"
  }
}

/** A Since yesterday line: the item's title, and the level change as evidence. */
export function movementLine(m: Movement, e: DeskEntry, ctx: CopyContext): { tag: string; text: string; levels: string } {
  if (e.category === 'fire' && m.kind !== 'closed') {
    const levels = m.from !== null ? `Level ${m.from} → ${m.to}` : `Level ${m.to} · ${LEVEL_NAMES[m.to!]}`
    return { tag: MOVE_TAGS[m.kind], text: fireMoveText(m, e), levels }
  }
  switch (m.kind) {
    case 'new':
      return { tag: '+ NEW', text: itemCopy(e, ctx).title, levels: `Level ${m.to} · ${LEVEL_NAMES[m.to!]}` }
    case 'reopened':
      return { tag: '+ BACK', text: itemCopy(e, ctx).title, levels: `Level ${m.to} · ${LEVEL_NAMES[m.to!]}` }
    case 'escalated':
      return { tag: '▲ UP', text: itemCopy(e, ctx).title, levels: `Level ${m.from} → ${m.to}` }
    case 'deescalated':
      return { tag: '▼ DOWN', text: itemCopy(e, ctx).title, levels: `Level ${m.from} → ${m.to}` }
    case 'closed':
      return { tag: '− CLOSED', text: closedLine(e), levels: `was Level ${m.from}` }
  }
}

const MOVE_TAGS: Record<MoveKind, string> = {
  new: '+ NEW',
  reopened: '+ BACK',
  escalated: '▲ UP',
  deescalated: '▼ DOWN',
  closed: '− CLOSED',
}

export interface SinceLine {
  key: string
  kind: MoveKind
  tag: string
  text: string
  levels: string
}

/** The level change of several moves as evidence: "Level 2 → 1", or "levels vary". */
function groupLevels(ms: Movement[]): string {
  const same = (k: 'from' | 'to') => ms.every((m) => m[k] === ms[0][k])
  const m = ms[0]
  switch (m.kind) {
    case 'new':
    case 'reopened':
      return same('to') ? `Level ${m.to} · ${LEVEL_NAMES[m.to!]}` : 'levels vary'
    case 'closed':
      return same('from') ? `were Level ${m.from}` : 'levels vary'
    default:
      return same('from') && same('to') ? `Level ${m.from} → ${m.to}` : 'levels vary'
  }
}

/** Several fire states or quakes with the same kind of change, as one line (the roundup rule). */
function groupLine(ms: Movement[], es: DeskEntry[]): Omit<SinceLine, 'key' | 'kind'> {
  const kind = ms[0].kind
  const n = es.length
  if (ms[0].category === 'fire') {
    const where = `${counted_(n, 'state', 'states')}: ${listText(es.map(stateName))}`
    const text = {
      new: `Fires jump above normal in ${where}`,
      reopened: `Fires flare up again in ${where}`,
      escalated: `Fires climb further in ${where}`,
      deescalated: ms.every((m) => m.to === 1) ? `Fires fall back toward normal in ${where}` : `Fires ease in ${where}`,
      closed: `Fires have stayed down for two days in ${where}`,
    }[kind]
    return { tag: MOVE_TAGS[kind], text, levels: groupLevels(ms) }
  }
  const near = es.some((x) => x.figures.in_india) ? 'in and near India' : "near India's borders"
  const text =
    kind === 'closed'
      ? `Two days have passed since ${numberWord(n)} earthquakes ${near}`
      : kind === 'new' || kind === 'reopened'
        ? `${cap(numberWord(n))} ${es.every((x) => x.level === 1) ? 'small ' : ''}earthquakes strike ${near}`
        : `${cap(numberWord(n))} earthquakes ${near} change level`
  return { tag: MOVE_TAGS[kind], text, levels: groupLevels(ms) }
}

/**
 * The Since yesterday list, in the order of the moves (new, back, up, down,
 * closed). Fire states and quakes with the same kind of change share a line.
 */
export function sinceLines(entries: DeskEntry[], ctx: CopyContext): SinceLine[] {
  if (!ctx.since) return []
  const byId = new Map<string, DeskEntry>()
  for (const e of entries) for (const x of e.members.length ? e.members : [e]) byId.set(x.key, x)
  const entryOf = (m: Movement) => byId.get(m.itemId) ?? snapshotEntry(m.snapshot)
  const moves = ctx.since.moves
  const done = new Set<string>()
  const out: SinceLine[] = []
  for (const m of moves) {
    if (done.has(m.itemId)) continue
    const same =
      m.category === 'fire' || m.category === 'earthquake'
        ? moves.filter((x) => x.category === m.category && x.kind === m.kind)
        : [m]
    for (const x of same) done.add(x.itemId)
    if (same.length >= 2) out.push({ key: `${m.category}:${m.kind}`, kind: m.kind, ...groupLine(same, same.map(entryOf)) })
    else out.push({ key: m.itemId, kind: m.kind, ...movementLine(m, entryOf(m), ctx) })
  }
  return out
}

// --- the page headline ---------------------------------------------------------------

/** The worst band and where: { band: 'very poor', where: 'Panipat' | 'three cities' }. */
function airWorst(e: DeskEntry): { band: string; where: string } | null {
  const worst = worstCities(e.figures)
  if (worst.length === 0) return null
  const top = counted(worst[0])
  const inTop = worst.filter((c) => counted(c) === top)
  return { band: BAND_WORDS[top], where: inTop.length === 1 ? inTop[0].city : `${numberWord(inTop.length)} cities` }
}

/** "air is very poor in Panipat", "air is poor in six cities" */
function airClause(e: DeskEntry): string {
  const a = airWorst(e)
  return a ? `air is ${a.band} in ${a.where}` : 'air is poor'
}

/** An item as a plain statement, mid-sentence: "Cyclone X is on a red alert" (quiet desk, all clear). */
function itemClause(e: DeskEntry): string {
  const f = e.figures
  switch (e.category) {
    case 'air':
      return airClause(e)
    case 'earthquake':
      return `a ${quakeStrength(f.magnitude ?? e.strength)} earthquake struck ${quakeWhere(e)}`
    case 'cyclone':
    case 'flood': {
      const colour = String(f.episode_alert_level ?? f.alert_level ?? '').toLowerCase()
      const name = e.category === 'cyclone' ? cycloneName(e.title) : floodName(e)
      return `${midName(name)} is on a ${colour} alert`
    }
    case 'fire':
      return stateTitle(e, emptyCtx)
  }
}

const emptyCtx: CopyContext = { editionAt: new Date(0).toISOString(), since: null, fires: [], ownFires: [] }

/** How the fire states moved since the edition a day earlier: more, fewer, the same, or unknown. */
function fireTrend(ctx: CopyContext): 'more' | 'fewer' | 'same' | null {
  const before = firesBefore(ctx)
  if (before === null) return null
  return ctx.fires.length > before ? 'more' : ctx.fires.length < before ? 'fewer' : 'same'
}

/** The fire states as one clause, mid-sentence: "fires ease across central India", "fires spread to four states". */
function firesClause(ctx: CopyContext, withAngle: boolean): string {
  const eased = fireEasing(ctx)
  if (eased) return `fires ease ${whereStates(eased).inText}`
  const where = whereStates(ctx.fires.map(stateName))
  const trend = fireTrend(ctx)
  // Intensity matches the verdict against past years: "far" only when a state beat its busiest day.
  const record = ctx.fires.some((e) => stateFacts(e, ctx).record === 'above')
  const clause =
    trend === 'more'
      ? `fires spread ${where.spreadText}`
      : trend === 'fewer'
        ? `fires ease but stay above normal ${where.inText}`
        : `fires run ${record ? 'far ' : ''}above normal ${where.inText}`
  if (!withAngle) return clause
  const angle = fireAngle(ctx.fires, ctx, false)
  return angle.kind === 'spreading' ? clause : `${clause}, ${angleSuffix(angle)}`
}

/** "holds at red alert", "rises to red alert": the move since yesterday, if the comparison says. */
function alertVerb(e: DeskEntry, ctx: CopyContext, colour: string): string {
  const move = ctx.since?.byItem.get(e.key)
  if (move?.kind === 'escalated') return `rises to ${colour} alert`
  if (move?.kind === 'deescalated') return `eases to ${colour} alert`
  if (move?.kind === 'reopened') return `is back on ${colour} alert`
  if (!move && ctx.since?.ref && ctx.since.refLevels.has(e.key)) return `holds at ${colour} alert`
  return `is on ${colour} alert`
}

/** An item as a headline clause, mid-sentence: the news, with a verb (style guide, The page headline). */
function headClause(e: DeskEntry, ctx: CopyContext): string {
  const f = e.figures
  switch (e.category) {
    case 'cyclone':
    case 'flood': {
      const colour = String(f.episode_alert_level ?? f.alert_level ?? '').toLowerCase()
      const name = e.category === 'cyclone' ? cycloneName(e.title) : floodName(e)
      // Name the sea only when the mapped area is centred well out at sea.
      const place = e.coords ? placeOf(e.coords[0], e.coords[1]) : null
      const sea = place?.sea && place.km >= 150 ? ` in ${place.sea}` : ''
      return `${midName(name)} ${alertVerb(e, ctx, colour)}${sea}`
    }
    case 'earthquake':
      return e.members.length > 0
        ? `${numberWord(e.members.length)} small earthquakes strike near India's borders`
        : `a ${quakeStrength(f.magnitude ?? e.strength)} earthquake strikes ${quakeWhere(e)}`
    case 'air': {
      const a = airWorst(e)
      if (!a) return 'air is poor'
      const move = ctx.since?.byItem.get(e.key)
      if (move?.kind === 'escalated' || move?.kind === 'new' || move?.kind === 'reopened') return `air turns ${a.band} in ${a.where}`
      if (move?.kind === 'deescalated') return `air eases to ${a.band} in ${a.where}`
      return `air is ${a.band} in ${a.where}`
    }
    case 'fire':
      if (e.members.length > 0) {
        const above = e.members.filter((x) => x.level >= 2)
        return above.length === 1 ? stateTitle(above[0], ctx) : firesClause(ctx, false)
      }
      return stateTitle(e, ctx)
  }
}

/**
 * The edition's headline: the lead item's news, then the next thing a reader
 * should know ("… as fires ease across central India"). Never about the
 * report itself (style guide, No self-reference).
 */
export function pageHeadline(entries: DeskEntry[], ctx: CopyContext): string {
  if (entries.length === 0 || entries[0].level <= 1) return quietHeadline(1)
  const lead = entries[0]
  if (lead.category === 'fire' && ctx.fires.length >= 2) {
    const other = entries.find((e) => e.category !== 'fire' && e.level >= 2)
    return `${cap(firesClause(ctx, true))}${other ? `, as ${headClause(other, ctx)}` : ''}.`
  }
  const head = cap(headClause(lead, ctx))
  if (lead.category !== 'fire' && (ctx.fires.length >= 2 || fireEasing(ctx))) return `${head} as ${firesClause(ctx, false)}.`
  const other = entries.find((e) => e !== lead && e.level >= 2)
  return other ? `${head} as ${headClause(other, ctx)}.` : `${head}.`
}

// --- the quiet desk ------------------------------------------------------------------

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth']

function ordinal(n: number): string {
  return n < ORDINALS.length ? ORDINALS[n] : `${n}th`
}

/** The quiet desk's headline, with how many days in a row nothing was above Level 1. */
export function quietHeadline(streak: number): string {
  if (streak >= 14) return 'A quiet fortnight across India, with nothing above minor for two weeks.'
  if (streak >= 2) return `A quiet day across India, the ${ordinal(streak)} in a row, with nothing above minor.`
  return 'A quiet day across India, with nothing above minor.'
}

function largestQuake(entries: DeskEntry[]): DeskEntry | null {
  const quakes = entries.filter((e) => e.category === 'earthquake').flatMap((e) => (e.members.length ? e.members : [e]))
  return quakes.sort((a, b) => b.strength - a.strength)[0] ?? null
}

function fireStates(entries: DeskEntry[]): string[] {
  return entries.filter((e) => e.category === 'fire').flatMap((e) => (e.members.length ? e.members : [e])).map(stateName)
}

/** One or two sentences on every category, then what is worth watching (null: not known for past editions). */
export function quietStandfirst(entries: DeskEntry[], watching: number | null): string {
  const gdacs = entries.filter((e) => e.category === 'cyclone' || e.category === 'flood')
  const first =
    gdacs.length === 0 ? 'No floods or cyclones are open.' : `${cap(listText(gdacs.map(itemClause)))}.`
  const fires = fireStates(entries)
  const quake = largestQuake(entries)
  const air = entries.find((e) => e.category === 'air')
  const aw = air ? airWorst(air) : null
  const parts = [
    fires.length === 0
      ? "no state's fires are well above normal"
      : fires.length === 1
        ? `${fires[0]}'s fires have fallen back toward normal`
        : `fires have fallen back toward normal in ${counted_(fires.length, 'state', 'states')}`,
    quake
      ? `the largest earthquake was magnitude ${(quake.figures.magnitude ?? quake.strength).toFixed(1)}`
      : `no earthquake of magnitude ${SCALE.quake.fetchMinMagnitude} or more has struck in or near India in two days`,
    aw ? `the worst air is ${aw.band}, in ${aw.where}` : "no city's air is poor",
  ]
  const sentences = [first, `${cap(listText(parts))}.`]
  if (watching !== null) {
    sentences.push(
      watching === 0
        ? 'Nothing is close to the next level.'
        : `${cap(numberWord(watching))} ${watching === 1 ? 'thing is' : 'things are'} worth watching.`,
    )
  }
  return sentences.join(' ')
}

export interface ClearRow {
  category: Category
  name: string
  level: Level | null
  line: string
  /** Where the category's figures come from in this edition: "GDACS", "CPCB". */
  source: string
  /** "As of Saturday" when the category's source didn't answer; null when up to date. */
  kicker: string | null
}

const CLEAR_NAMES: Record<Category, string> = {
  cyclone: 'Cyclones',
  flood: 'Floods',
  earthquake: 'Earthquakes',
  air: 'Air',
  fire: 'Fire',
}

/** The all-clear table: one row per category, from the edition's items and category_status. */
export function allClearRows(entries: DeskEntry[], status: CategoryStatus[], editionAt: string): ClearRow[] {
  return CATEGORY_ORDER.map((category) => {
    const st = status.find((c) => c.category === category)
    const rows = entries.filter((e) => e.category === category)
    const level = rows.length > 0 ? (Math.max(...rows.map((e) => e.level)) as Level) : null
    let line: string
    switch (category) {
      case 'cyclone':
      case 'flood':
        line = rows.length === 0 ? 'None open.' : `${cap(listText(rows.map(itemClause)))}.`
        break
      case 'earthquake': {
        const q = largestQuake(rows)
        const n = rows.flatMap((e) => (e.members.length ? e.members : [e])).length
        line = !q
          ? `None of magnitude ${SCALE.quake.fetchMinMagnitude} or more in or near India in the last two days.`
          : n === 1
            ? `${cap(quakeMemberLine(q))}.`
            : `${cap(numberWord(n))} small earthquakes; the largest: ${quakeMemberLine(q).replace(/^Magnitude/, 'magnitude')}.`
        break
      }
      case 'air': {
        const air = rows[0]
        const worst = air ? worstCities(air.figures) : []
        const aw = air ? airWorst(air) : null
        line = !aw ? 'No city is poor or worse.' : `${cap(aw.band)} in ${aw.where}, worst in ${worst[0].city} at ${worst[0].aqi ?? Math.round(worst[0].pm25_24h ?? 0)}.`
        break
      }
      case 'fire': {
        const states = fireStates(rows)
        line =
          states.length === 0
            ? "No state's fires are well above normal for the time of year."
            : `${listText(states)} ${states.length === 1 ? 'has' : 'have'} fallen back toward normal.`
        break
      }
    }
    const stale = rows.find((e) => e.lastKnown)
    return {
      category,
      name: CLEAR_NAMES[category],
      level,
      line,
      source: st ? (SOURCE_NAMES[st.source] ?? st.source) : '',
      kicker: st?.last_known ? ((stale && asOfKicker(stale, editionAt)) ?? 'Not updated') : null,
    }
  })
}

/** "Last: Cyclone Arnab" for days since a Level 3+ item. */
export function level3Title(s: TimedSnapshot, ctx: CopyContext): string {
  return itemCopy(snapshotEntry(s), ctx).title
}

/** A closed item's name, for Recently closed: "Gujarat's fires", "Cyclone Arnab". */
export function closedSubject(e: DeskEntry): string {
  switch (e.category) {
    case 'fire':
      return `${possessive(stateName(e))} fires`
    case 'earthquake':
      return `Magnitude ${(e.figures.magnitude ?? e.strength).toFixed(1)} earthquake, ${quakeWhere(e)}`
    case 'cyclone':
      return cycloneName(e.title)
    case 'flood':
      return floodName(e)
    case 'air':
      return 'Air pollution'
  }
}

export interface WatchCopy {
  title: string
  standfirst: string
  /** The trend as evidence: "282 → 268 → 288 → 293". */
  trend: string | null
}

const AIR_NEXT: Record<number, string> = { 2: 'very poor', 3: 'severe', 4: 'severe in three cities' }

/** "27 Oct" in a metric, as a day key in the edition's year (the year before, if that would be later). */
function metricDay(metric: string, editionAt: string): string | null {
  const m = /on (\d{1,2}) (\w{3})/.exec(metric)
  if (!m) return null
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = months.indexOf(m[2])
  if (mi < 0) return null
  const today = istDay(editionAt)
  let year = Number(today.slice(0, 4))
  const key = (y: number) => `${y}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (key(year) > today) year -= 1
  return key(year)
}

/** A watching subject in words (latest edition only: desk_watch keeps current state). */
export function watchCopy(row: WatchRow, ctx: CopyContext): WatchCopy {
  const v = row.value
  const t = row.next_threshold
  const next = row.next_level
  const rising = row.rising_updates >= 2
  const past = (row.watch_reason ?? '').startsWith('past')
  const trend =
    row.trend && row.trend.length >= 2
      ? row.trend
          .slice(-5)
          .map((p) => (Number.isInteger(p.value) ? String(p.value) : p.value.toFixed(1)))
          .join(' → ')
      : null
  switch (row.category) {
    case 'air': {
      const city = /\bin ([^,;]+?)(?:, the worst city|;|,|$)/.exec(row.metric)?.[1] ?? 'the worst city'
      const band = next ? (AIR_NEXT[next] ?? `Level ${next}`) : 'the next level'
      const aqi = row.metric.startsWith('CPCB AQI')
      const title = past
        ? `${possessive(city)} air reads ${band}`
        : rising
          ? `${possessive(city)} air has risen for ${numberWord(row.rising_updates)} reports toward ${band}`
          : `${possessive(city)} air is close to ${band}`
      const standfirst = aqi
        ? `Its air quality index is ${v}; ${band} starts above ${t}.`
        : `Fine-particle pollution there averages ${v} µg/m³ over a day; ${band} starts above ${t}.`
      return { title, standfirst, trend }
    }
    case 'fire': {
      const day = metricDay(row.metric, ctx.editionAt)
      const when = day ? relativeDay(day, ctx.editionAt) : 'on its latest full day'
      const S = possessive(row.title)
      const title = past
        ? `${S} fires are at the Level ${next} mark`
        : rising
          ? `${S} fires have risen for ${numberWord(row.rising_updates)} days toward Level ${next}`
          : `${S} fires are close to Level ${next}`
      return { title, standfirst: `${plural(v ?? 0, 'fire', 'fires')} ${when}, against ${t} for Level ${next}.`, trend }
    }
    case 'earthquake':
      return {
        title: `A magnitude ${v} quake came close to Level ${next}`,
        standfirst: `Level ${next} starts at magnitude ${t}.`,
        trend: null,
      }
    case 'cyclone':
    case 'flood': {
      const name = row.category === 'cyclone' ? cycloneName(row.title) : row.title
      return {
        title: rising ? `${possessive(name)} alert is rising` : `${name} is close to a higher alert`,
        standfirst: `Its alert score from ${SOURCE_WORDS.GDACS} is ${v}; Level ${next} starts at ${t}.`,
        trend,
      }
    }
  }
}

