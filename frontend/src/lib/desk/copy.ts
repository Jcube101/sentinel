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
import { SCALE, minFireEvents, scaleFrom, type Scale } from './scale'
import type { AirBand, AirCity, Category, CategoryStatus, Change, Edition, Level, TimedSnapshot, WatchRow } from './types'
import { CATEGORY_ORDER } from './entries'
import { SOURCE_NAMES } from './sources'
import { istDay } from './ist'
import { placeOf, placeText } from './where'
import { asOfKicker, fireDayCutOff } from './notes'
import { cycloneWind, weakened } from './wind'
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
  /** The level rules the edition ran with (plan P3). */
  scale: Scale
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

export function copyContext(entries: DeskEntry[], since: SinceYesterday | null, run: Pick<Edition, 'started_at' | 'severity_config'>): CopyContext {
  const fireRows = entries.filter((e) => e.category === 'fire')
  const states = fireRows.flatMap((e) => (e.members.length > 0 ? e.members : [e]))
  return {
    editionAt: run.started_at,
    since,
    fires: states.filter((e) => e.level >= 2).sort((a, b) => b.strength - a.strength),
    ownFires: fireRows.filter((e) => e.members.length === 0),
    scale: scaleFrom(run.severity_config),
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
  /** The state's national rank by fires that day (plan P6, from edition 30); null before, or with no fires. */
  rank: number | null
  /** Another state had the same count. */
  rankShared: boolean
}

/**
 * How many years the fire baseline covers: 2 for "2024-2025", 3 for "2023-2025". From the item's own
 * figures (norm_years), else the years in the edition's stored config: never a fixed "two".
 */
function baselineYears(e: DeskEntry, scale: Scale): number {
  const [a, b] = String(e.figures.norm_years ?? scale.fire.baselineYears)
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
    counted: r !== null && n >= minFireEvents(f, ctx.scale),
    record: max === null ? null : n > max ? 'above' : n === max ? 'equal' : 'within',
    span: baselineYears(e, ctx.scale),
    rank: typeof f.state_rank === 'number' && n > 0 ? f.state_rank : null,
    rankShared: f.rank_shared === true,
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

/**
 * The state's count against every state's that day (plan P6), its own
 * sentence after the state's: "That was the most of any state." A count
 * another state matched "tied for" it. Nothing below first place, and
 * nothing for editions before the rank was stored.
 */
function rankSentence(f: StateFacts): string {
  if (f.rank !== 1) return ''
  return f.rankShared ? ' That tied for the most of any state.' : ' That was the most of any state.'
}

/** A state's sentence, then its national rank when it led every state. */
function stateSentences(f: StateFacts, verdict = true): string {
  return stateSentence(f, verdict) + rankSentence(f)
}

/**
 * The roundup's biggest count, when another state leads: "Madhya Pradesh had
 * the most fires of any state, 200, …". With the national rank stored (from
 * edition 30), "of any state" only for first place ("tied for" when shared),
 * else "of the states above normal"; before it, "had the most fires", which
 * meant the most of the states in the story.
 */
function mostSentence(f: StateFacts): string {
  const vs = f.counted && f.r !== null ? `, ${timesAverage(f.r, f.period)}${verdictClause(f)}` : ''
  const most =
    f.rank === 1
      ? f.rankShared
        ? 'tied for the most fires of any state'
        : 'had the most fires of any state'
      : f.rank !== null
        ? 'had the most fires of the states above normal'
        : 'had the most fires'
  return `${f.state} ${most}, ${f.n}${vs}.`
}

/** The edition's own run recorded this change (the first edition to report it), not just the day's comparison. */
const isFresh = (c: Change | null | undefined) => c === 'opened' || c === 'reopened' || c === 'escalated' || c === 'deescalated'
const isRise = (c: Change | null | undefined) => c === 'opened' || c === 'reopened' || c === 'escalated'

/** Fire states that fell a level, and how many rose, in this edition's own run (the first edition to report it). */
function fireMoves(ctx: CopyContext): { fell: Movement[]; rose: number } {
  const moves = (ctx.since?.moves ?? []).filter((m) => m.category === 'fire' && isFresh(m.snapshot.change))
  return {
    fell: moves.filter((m) => m.kind === 'deescalated'),
    rose: moves.filter((m) => isRise(m.snapshot.change)).length,
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
        `NASA's fire satellites picked up a large fire${where}, close to a town of ${ctx.scale.fire.level4MinPopulation.toLocaleString('en-IN')} people or more. ` +
        stateSentences(f),
    }
  }
  if (wildfire && (!f.counted || (ff.gdacs_level ?? 0) > (ff.ratio_level ?? 0))) {
    const colour = (wildfire.alert_level ?? '').toLowerCase()
    return {
      title: `Global monitors put a forest fire in ${f.state} on alert`,
      standfirst: `Global disaster monitors have a ${colour ? `${colour} ` : ''}forest-fire alert in ${f.state}. ${stateSentences(f)}`,
    }
  }
  if (f.n === 0) return { title: `Satellites see no fires in ${f.state}`, standfirst: stateSentence(f) }
  if (!f.counted) return { title: `${f.state} is down to ${plural(f.n, 'fire', 'fires')}`, standfirst: stateSentences(f) }
  // A record title already gives the verdict; the standfirst doesn't repeat it.
  const recordTitle = f.record === 'above' || f.record === 'equal'
  return { title: stateTitle(e, ctx), standfirst: stateSentences(f, !recordTitle) }
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
    // Easing is the story: no rank sentence, so the standfirst stays at three sentences.
    if (above.length > 0) sentences.push(stateSentence(stateFacts(above[0], ctx)))
    const others = above.slice(1).map(stateName)
    if (others.length > 0) sentences.push(`${listText(others)} ${others.length === 1 ? 'is' : 'are'} also still above normal.`)
    return { title, standfirst: sentences.join(' ') }
  }

  if (above.length === 0) {
    const names = e.members.map(stateName)
    return {
      // Only built in the edition whose own run lowered a state (entries.ts drops it after that).
      title: `Fires ease ${whereStates(names).inText}`,
      standfirst: `${listText(names)} ${names.length === 1 ? 'has' : 'have'} fallen back toward normal.`,
    }
  }
  if (above.length === 1) return fireStateCopy(above[0], ctx)

  const also = ctx.ownFires.some((x) => x.level >= 2)
  const angle = fireAngle(above, ctx, !also)
  // The title says what the states are doing and how many; which state stands out is the standfirst's
  // first sentence, and what is new since yesterday is Since yesterday's (style guide, The fire roundup).
  // One-time verbs only while a state's rise is this edition's own news; after that the states "stay high".
  const rising = above.filter((x) => isRise(x.runChange))
  const record = rising.some((x) => stateFacts(x, ctx).record === 'above' && stateFacts(x, ctx).counted)
  const verb = record ? 'surge' : rising.length > 0 ? 'flare' : 'stay high'
  const title = also
    ? `Fires ${verb} in ${counted_(above.length, 'more state', 'more states')}`
    : `Fires ${verb} in ${counted_(above.length, 'state', 'states')}`

  // The standout: the state the angle names, else the furthest above normal.
  const standout = angle.kind === 'record' || angle.kind === 'new' ? angle.states[0] : above[0]
  const sentences = [stateSentences(stateFacts(standout, ctx))]
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

/** A metric's bands under a scale (an AQI reading always has AQI bands: the CPCB feed came with them). */
const bandsOf = (s: Scale, m: AirMetric) => (m === 'aqi' ? (s.air.aqi ?? SCALE.air.aqi) : s.air[m])

const NEXT_BAND: Partial<Record<AirBand, { band: AirBand; above: (s: Scale, m: AirMetric) => number }>> = {
  poor: { band: 'very_poor', above: (s, m) => bandsOf(s, m).veryPoorAbove },
  very_poor: { band: 'severe', above: (s, m) => bandsOf(s, m).severeAbove },
}

/**
 * The worst city's reading against the bands: "rated 'very poor'", "just
 * short of 'very poor'" (within 5% of it), or, for a Severe reading not yet
 * confirmed, "past the 'severe' line in the latest report".
 */
function bandPhrase(v: number, city: AirCity, metric: AirMetric, scale: Scale): string {
  const band = counted(city)
  const next = NEXT_BAND[band]
  if (next && v > next.above(scale, metric)) return `past the '${BAND_WORDS[next.band]}' line in the latest report`
  if (next && v >= next.above(scale, metric) * 0.95) return `just short of '${BAND_WORDS[next.band]}'`
  return `rated '${BAND_WORDS[band]}'`
}

function airCopy(e: DeskEntry, scale: Scale): ItemCopy {
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
    sentences.push(`${w.city} had the worst air in the country, with an index of ${w.aqi}, ${bandPhrase(w.aqi, w, 'aqi', scale)}.`)
  } else {
    const pm25 = typeof w.pm25_24h === 'number'
    const v = Math.round((pm25 ? w.pm25_24h : w.pm10_24h) ?? 0)
    const what = pm25 ? 'fine particles (PM2.5)' : 'coarse dust (PM10)'
    sentences.push(`${w.city} had the worst air in the country, with ${what} averaging ${v} µg/m³ over a day, ${bandPhrase(v, w, pm25 ? 'pm25' : 'pm10', scale)}.`)
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
  // The latest advisory's wind (edition 32 on); before that only the peak is known, and said as the peak.
  const w = cyclone ? cycloneWind(f) : null
  const wind =
    w?.now != null ? `, with winds of up to ${w.now} km/h` : w?.peak != null ? `, with peak winds of ${w.peak} km/h` : ''
  // Where GDACS places the event (its point is the centre of the area it maps, not a track).
  let s = `Global disaster monitors give it ${alertRank(now, 'their')}${wind}.`
  if (e.coords) s += ` They place it ${placeText(placeOf(e.coords[0], e.coords[1]))}.`
  if (w && weakened(w)) s += ` Its winds peaked at ${w.peak} km/h.`
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
      return airCopy(e, ctx.scale)
    case 'earthquake':
      return quakeCopy(e)
    case 'cyclone':
      return { title: cycloneName(e.title), standfirst: gdacsStandfirst(e, true) }
    case 'flood':
      return { title: floodName(e), standfirst: gdacsStandfirst(e, false) }
  }
}

/**
 * A closed cyclone as news, only as far as its closing figures go (edition 32 on):
 * "weakens" when its latest wind is below its peak, "crossing the Andhra Pradesh
 * coast" when it made landfall. Otherwise the closing rule's plain line.
 */
function cycloneClosedLine(e: DeskEntry): string {
  const name = cycloneName(e.title)
  const land = e.figures.landfall ?? null
  const crossing = land ? (land.state ? `crossing the ${land.state} coast` : 'making landfall') : null
  if (weakened(cycloneWind(e.figures))) return crossing ? `${name} weakens after ${crossing}` : `${name} weakens`
  if (land) return land.state ? `${name} crosses the ${land.state} coast` : `${name} makes landfall`
  return `Global disaster monitors have stopped tracking ${midName(name)}`
}

/** Why a closed item left, from its closing rule. */
export function closedLine(e: DeskEntry): string {
  switch (e.category) {
    case 'fire':
      return `${possessive(stateName(e))} fires have stayed down for two days`
    case 'earthquake':
      return `Two days have passed since the ${quakeStrength(e.figures.magnitude ?? e.strength)} earthquake ${quakeWhere(e)}`
    case 'cyclone':
      return cycloneClosedLine(e)
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

const emptyCtx: CopyContext = { editionAt: new Date(0).toISOString(), since: null, fires: [], ownFires: [], scale: SCALE }

// A headline is one main event, optionally a second after "as" (docs/style-guide.md, The page
// headline): about twelve words, a strong verb, at most two places named, nothing about the
// desk's own bookkeeping. What is new since yesterday belongs in Since yesterday.

/** The most words a headline may run to before its second event is dropped. */
const HEADLINE_WORDS = 12
/** The most places a headline may name. */
const HEADLINE_PLACES = 2

/** One thing worth a headline: its clause (no capital, no full stop), the places it names, how big and whether it moved. */
interface HeadEvent {
  category: Category
  level: number
  /** Something changed since the edition a day earlier. */
  moved: boolean
  text: string
  places: number
}

const COAST_WORDS: Record<string, string> = { 'Andhra Pradesh': 'Andhra', 'West Bengal': 'Bengal' }

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

/** How many places a whereStates text names: the states themselves (one or two), a region as one, a bare count as none. */
function placesIn(where: string, states: number): number {
  if (states <= 2) return states
  return /^across /.test(where) ? 1 : 0
}

// One-time verbs (crosses, turns, flares, climbs, surges, strikes) are for the first edition that reports
// the change: the edition whose own run recorded it (runChange), or a landfall in the last run's interval.
// Every edition after says what the state is now: "stays", "weakens inland", "stay high".

/** A landfall this recent (hours before the edition) is still news; the pipeline runs every six. */
const LANDFALL_NEWS_HOURS = 6

/** A cyclone as a clause: "Cyclone Arnab crosses the Andhra coast and weakens", then "weakens inland over Andhra Pradesh". */
function cycloneEvent(e: DeskEntry, ctx: CopyContext): HeadEvent {
  const f = e.figures
  const name = cycloneName(e.title)
  const move = ctx.since?.byItem.get(e.key)
  const w = cycloneWind(f)
  const land = f.landfall ?? null
  const fading = weakened(w) || e.runChange === 'deescalated'
  const crossedJustNow = !!land && Date.parse(ctx.editionAt) - Date.parse(land.at) <= LANDFALL_NEWS_HOURS * 3600_000
  let text: string
  let places = 0
  if (land && crossedJustNow) {
    if (land.state) {
      text = `${name} crosses the ${COAST_WORDS[land.state] ?? land.state} coast`
      places = 1
    } else text = `${name} makes landfall`
    if (fading) text += ' and weakens'
  } else if (land) {
    // After the crossing: where it is now.
    text = `${name} ${fading ? 'weakens' : 'moves'} inland${land.state ? ` over ${land.state}` : ''}`
    places = land.state ? 1 : 0
  } else if (fading) text = `${name} weakens`
  else if (isRise(e.runChange)) text = `${name} strengthens`
  else {
    const colour = String(f.episode_alert_level ?? f.alert_level ?? '').toLowerCase()
    text = `${name} holds at ${colour} alert`
  }
  // Only a storm at sea gets the sea; one that has crossed already has its coast.
  const place = !land && e.coords ? placeOf(e.coords[0], e.coords[1]) : null
  if (place?.sea && place.km >= 150) {
    text += ` in ${place.sea}`
    places += 1
  }
  return { category: e.category, level: e.level, moved: !!move && move.kind !== 'closed', text, places }
}

/** The fire states as one event: "fires flare in Gujarat", "fires ease across central India", then "fires stay high in Gujarat". */
function fireEvent(ctx: CopyContext): HeadEvent | null {
  const eased = fireEasing(ctx)
  if (ctx.fires.length === 0 && !eased) return null
  const moves = (ctx.since?.moves ?? []).filter((m) => m.category === 'fire')
  const stateOf = (m: Movement) => String(m.snapshot.figures?.state ?? m.itemId)
  // Rises the edition's own run recorded; earlier ones are just where the states are now.
  const up = moves.filter((m) => isRise(m.snapshot.change))
  const named = (verb: string, states: string[]): HeadEvent => {
    const where = whereStates(states).inText
    return {
      category: 'fire',
      level: Math.max(1, ...ctx.fires.map((x) => x.level)),
      moved: moves.length > 0,
      text: `fires ${verb} ${where}`,
      places: placesIn(where, states.length),
    }
  }
  if (eased) return named('ease', eased)
  if (up.length > 0) {
    const record = ctx.fires.some((x) => stateFacts(x, ctx).record === 'above' && up.some((m) => stateOf(m) === stateName(x)))
    return named(record ? 'surge' : up.some((m) => m.snapshot.change !== 'escalated') ? 'flare' : 'climb', up.map(stateOf))
  }
  return named('stay high', ctx.fires.map(stateName))
}

/** The air item as a clause: "air turns very poor in eight cities" (first edition), then "air stays very poor in eight cities". */
function airEvent(e: DeskEntry, ctx: CopyContext): HeadEvent {
  const a = airWorst(e)
  const move = ctx.since?.byItem.get(e.key)
  let text = 'air is poor'
  if (a) {
    if (isRise(e.runChange)) text = `air turns ${a.band} in ${a.where}`
    else if (e.runChange === 'deescalated') text = `air eases to ${a.band} in ${a.where}`
    else text = `air stays ${a.band} in ${a.where}`
  }
  return { category: 'air', level: e.level, moved: !!move && move.kind !== 'closed', text, places: a && !/cities$/.test(a.where) ? 1 : 0 }
}

/** An earthquake, or the small ones together: "strikes" in its first edition, "struck" after. */
function quakeEvent(e: DeskEntry, ctx: CopyContext): HeadEvent {
  const move = ctx.since?.byItem.get(e.key)
  const f = e.figures
  const fresh = isFresh(e.runChange)
  const text =
    e.members.length > 0
      ? `${numberWord(e.members.length)} small earthquakes ${fresh || e.members.some((m) => isFresh(m.runChange)) ? 'strike' : 'struck'} near India's borders`
      : `a ${quakeStrength(f.magnitude ?? e.strength)} earthquake ${fresh ? 'strikes' : 'struck'} ${quakeWhere(e)}`
  return { category: 'earthquake', level: e.level, moved: !!move && move.kind !== 'closed', text, places: /near (?!India)/.test(text) ? 1 : 0 }
}

/** A flood as a clause: "flooding in Assam is on an orange alert", "worsens" only in the edition that reports it. */
function floodEvent(e: DeskEntry, ctx: CopyContext): HeadEvent {
  const move = ctx.since?.byItem.get(e.key)
  const colour = String(e.figures.episode_alert_level ?? e.figures.alert_level ?? '').toLowerCase()
  const verb = e.runChange === 'escalated' ? 'worsens' : e.runChange === 'deescalated' ? 'eases' : 'is on'
  const text = verb === 'is on' ? `${midName(floodName(e))} is on ${/^[aeiou]/.test(colour) ? 'an' : 'a'} ${colour} alert` : `${midName(floodName(e))} ${verb}`
  return { category: 'flood', level: e.level, moved: !!move && move.kind !== 'closed', text, places: 1 }
}

/** Every event of the edition that is worth a headline, most newsworthy first: level, then what moved, then category order. */
function headEvents(entries: DeskEntry[], ctx: CopyContext): HeadEvent[] {
  const out: HeadEvent[] = []
  for (const e of entries) {
    if (e.level < 2 || e.category === 'fire') continue
    if (e.category === 'cyclone') out.push(cycloneEvent(e, ctx))
    else if (e.category === 'flood') out.push(floodEvent(e, ctx))
    else if (e.category === 'earthquake') out.push(quakeEvent(e, ctx))
    else if (e.category === 'air') out.push(airEvent(e, ctx))
  }
  const fires = fireEvent(ctx)
  if (fires) out.push(fires)
  const rank = (c: Category) => CATEGORY_ORDER.indexOf(c)
  return out.sort((a, b) => b.level - a.level || Number(b.moved) - Number(a.moved) || rank(a.category) - rank(b.category))
}

/**
 * The edition's headline: the main event, then optionally a second of another kind after
 * "as", if it fits in about twelve words and two places. Never about the report itself or
 * its bookkeeping (style guide, The page headline).
 */
export function pageHeadline(entries: DeskEntry[], ctx: CopyContext): string {
  const events = headEvents(entries, ctx)
  if (events.length === 0 || events[0].level < 2) return quietHeadline(1)
  const [lead, ...rest] = events
  const one = cap(lead.text)
  // The first other event that fits in the words and places left; those that don't are dropped, not squeezed.
  for (const second of rest) {
    if (second.category === lead.category || lead.places + second.places > HEADLINE_PLACES) continue
    const both = `${one} as ${second.text}`
    if (wordCount(both) <= HEADLINE_WORDS) return `${both}.`
  }
  return `${one}.`
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

