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
import { nextDay, runEndingAt, stepDirection, type FireDay, type FireHistory } from './fireHistory'
import {
  SOURCE_WORDS,
  alertRank,
  alertRankWord,
  aboutWhatSees,
  benchmark,
  cap,
  listText,
  numberWord,
  partOfMonth,
  possessive,
  quakeStrength,
  relativeDay,
  roundKm,
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
  /** Fire days before the edition's own, for "up from 15 on Monday" and "for a third day"; without it the copy says less. */
  history?: FireHistory
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

export function copyContext(entries: DeskEntry[], since: SinceYesterday | null, run: Pick<Edition, 'started_at' | 'severity_config'>, history?: FireHistory): CopyContext {
  const fireRows = entries.filter((e) => e.category === 'fire')
  const states = fireRows.flatMap((e) => (e.members.length > 0 ? e.members : [e]))
  return {
    editionAt: run.started_at,
    since,
    fires: states.filter((e) => e.level >= 2).sort((a, b) => b.strength - a.strength),
    ownFires: fireRows.filter((e) => e.members.length === 0),
    scale: scaleFrom(run.severity_config),
    history,
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
  /** The fire day, as a date. */
  dayIso: string
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
    dayIso: typeof f.day === 'string' ? f.day : '',
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

// The fire copy follows docs/style-guide.md (Fire): we measure satellite-detected fire clusters, rolled up to
// districts and states, against the usual for the time of year. A title is place + direction + benchmark; the
// direction leads and the benchmark is the contrast after a comma. No decimals and no cluster counts in a
// title: only district counts, and only when spreading is the story.

/** The edition's own run recorded this change (the first edition to report it), not just the day's comparison. */
const isFresh = (c: Change | null | undefined) => c === 'opened' || c === 'reopened' || c === 'escalated' || c === 'deescalated'
const isRise = (c: Change | null | undefined) => c === 'opened' || c === 'reopened' || c === 'escalated'

/** The pipeline reads fire days at its 09:00 UTC run; the two runs after it repeat that day. */
function isFirstSlot(editionAt: string): boolean {
  const h = new Date(editionAt).getUTCHours()
  return h >= 6 && h < 15
}

const hyphen = (period: string) => period.replace(' ', '-')
const yearsOf = (n: number) => (n >= 2 ? `${numberWord(n)} years` : 'a year')

/** One state's fires read against its recent days: which way, for how long, how wide, how big. */
interface FireStory {
  e: DeskEntry
  f: StateFacts
  /** Compared with the day before (complete days only); without it, with the change the run recorded. */
  dir: 'up' | 'down' | 'hold'
  /** Days in a row moving that way, today included. */
  steps: number
  /** When dipping: the days of rises that came before. */
  surgeBefore: number
  /** A jump, not a drift. */
  big: boolean
  /** A drop of a third or more. */
  deep: boolean
  prev: FireDay | null
  /** Days in a row above the level-2 line, today included. */
  aboveRun: number
  spread: boolean
  record: boolean
  tie: boolean
  /** Say the change ("climb"), not where the state stands ("stay above usual"): the first edition of the day. */
  voice: 'now' | 'still'
  /** Worth a headline: a record, a spread, a move, or a long run above usual (a busy state within its range is not). */
  news: boolean
}

function fireStory(e: DeskEntry, ctx: CopyContext): FireStory {
  const f = stateFacts(e, ctx)
  const today: FireDay = { day: f.dayIso, events: f.n, districts: f.districts, ratio: f.r, counted: f.counted }
  const past = (ctx.history?.get(e.key) ?? []).filter((d) => !f.dayIso || d.day < f.dayIso)
  const series = f.dayIso ? [...past, today] : past
  const last = series.length - 1
  const prev = last >= 1 && nextDay(series[last - 1].day, series[last].day) ? series[last - 1] : null
  const cutOff = fireDayCutOff(e) !== null

  // Without the day before (the state wasn't on the desk), the move since yesterday says which way it went.
  const kind = ctx.since?.byItem.get(e.key)?.kind
  const moved: FireStory['dir'] = kind === 'new' || kind === 'reopened' || kind === 'escalated' || isRise(e.runChange) ? 'up' : kind === 'deescalated' || e.runChange === 'deescalated' ? 'down' : 'hold'
  let dir: FireStory['dir'] = prev ? stepDirection(prev.events, f.n) : moved
  if (cutOff && dir === 'down') dir = 'hold'
  const steps = prev && dir !== 'hold' ? runEndingAt(series, last, dir) : dir === 'hold' ? 0 : 1
  const surgeBefore = prev && dir === 'down' ? runEndingAt(series, last - 1, 'up') : 0

  let aboveRun = 0
  const line = ctx.scale.fire.level2MinRatio
  for (let i = last; i >= 0; i--) {
    const d = series[i]
    if (!d.counted || d.ratio === null || d.ratio < line) break
    if (i < last && !nextDay(d.day, series[i + 1].day)) break
    aboveRun++
  }
  const spread = !!prev && f.counted && f.districts >= prev.districts + 3 && f.districts >= prev.districts * 1.25
  const record = f.record === 'above' && f.counted
  const tie = f.record === 'equal' && f.counted
  return {
    e,
    f,
    dir,
    steps,
    surgeBefore,
    big: !!prev && dir === 'up' && f.n >= prev.events * 1.75 && f.n - prev.events >= 10,
    deep: !!prev && dir === 'down' && f.n <= prev.events * 0.67,
    prev,
    aboveRun,
    spread,
    record,
    tie,
    voice: isFirstSlot(ctx.editionAt) || isFresh(e.runChange) ? 'now' : 'still',
    news: e.level >= 3 || (e.level >= 2 && (record || tie || spread || dir !== 'hold' || aboveRun >= 3)),
  }
}

/** "for a third day", from the second day on. */
const forDay = (n: number, from = 2) => (n >= from ? ` for a ${ordinal(n)} day` : '')

/** The benchmark after the comma: "double the usual for late October". */
/** "Above usual" is only said of a state above its norm; a Level 3 state on a wildfire alert alone can sit at or below it. */
const aboveNorm = (e: DeskEntry): boolean => typeof e.figures.ratio_to_norm !== 'number' || e.figures.ratio_to_norm > 1
const benchFor = (s: FireStory) => (s.f.r !== null ? `${benchmark(s.f.r)} for ${s.f.period}` : 'above the usual')

interface Clause {
  /** The whole clause. */
  full: string
  /** Without its benchmark, for a headline that joins two events. */
  short: string
}

/** The strongest first: highest ratio, then most fires. */
const byStrength = (a: FireStory, b: FireStory) => (b.f.r ?? 0) - (a.f.r ?? 0) || b.f.n - a.f.n

/**
 * One state as a title, in order: a record, a spread, then the move ("climb", "dip after a surge") in the
 * first edition of the day, else where it stands ("stay above usual", for a Nth day).
 */
function stateClause(s: FireStory): Clause {
  const { state } = s.f
  const same = (t: string): Clause => ({ full: t, short: t })
  // A record is said once, in the first edition that reports it; after that the state is "after record day".
  if (s.voice === 'now' && s.record) return same(`${state} sees its busiest ${hyphen(s.f.period)} fire day in ${yearsOf(s.f.span)}`)
  if (s.voice === 'now' && s.tie) return same(`${state} matches its busiest ${hyphen(s.f.period)} fire day in ${yearsOf(s.f.span)}`)
  if (s.voice === 'now') {
    if (s.spread) return same(`Fires spread to ${s.f.districts} districts in ${state}`)
    if (s.dir === 'up') {
      const short = `Fires ${s.big ? 'surge' : 'climb'} in ${state}${forDay(s.steps)}`
      return { short, full: `${short}, ${benchFor(s)}` }
    }
    if (s.dir === 'down' && s.e.level >= 2) {
      const surge = s.surgeBefore >= 3 ? ` after ${numberWord(s.surgeBefore)}-day surge` : ''
      const short = `${state} fires ${s.deep ? 'ease' : 'dip'}${surge}`
      return aboveNorm(s.e) ? { short, full: `${short}, still above usual` } : same(short)
    }
  }
  // A Level 3 state is well above usual: its benchmark stays in the title.
  const stay = `Fires ${aboveNorm(s.e) ? 'stay above usual' : 'continue'} in ${state}${s.record || s.tie ? ' after record day' : forDay(s.aboveRun, 3)}`
  return s.e.level >= 3 ? { short: stay, full: `${stay}, ${benchFor(s)}` } : same(stay)
}

/** How newsworthy a fire story is: 3 a record, 2 a move said for the first time (incl. easing), 1 a state that stays. */
function storyTier(s: FireStory): number {
  // A state that set a record earlier in the same fire day outranks the other continuing items.
  if (s.voice !== 'now') return s.record || s.tie ? 1.5 : 1
  if (s.record || s.tie) return 3
  return s.spread || s.dir !== 'hold' ? 2 : 1
}

/** The states a clause names: a record or a lone state names itself, a group is a region or a pair. */
function placesOf(names: string[]): number {
  return placesIn(whereStates(names).inText, names.length)
}

/** Several states as one clause: "Fires climb across western India, double the usual in Gujarat and Maharashtra". */
function groupClause(stories: FireStory[]): { clause: Clause; places: number; tier: number } {
  const news = stories.filter((s) => s.news).sort(byStrength)
  const pool = news.length > 0 ? news : [...stories].sort(byStrength)
  const lone = (s: FireStory) => ({ clause: stateClause(s), places: 1, tier: storyTier(s) })
  const records = pool.filter((s) => (s.record || s.tie) && s.voice === 'now')
  if (records.length > 0) return lone(records[0])
  // The record was said in an earlier edition: the state that set it is still the one to name.
  const afterRecord = pool.filter((s) => s.record || s.tie)
  if (afterRecord.length > 0) return { ...lone(afterRecord[0]), tier: 1.5 }
  const spreads = pool.filter((s) => s.spread && s.voice === 'now').sort((a, b) => b.f.districts - a.f.districts)
  if (spreads.length > 0) return lone(spreads[0])
  if (pool.length === 1) return lone(pool[0])

  const names = (xs: FireStory[]) => xs.map((s) => s.f.state)
  const now = pool.filter((s) => s.voice === 'now')
  const ups = now.filter((s) => s.dir === 'up')
  const downs = now.filter((s) => s.dir === 'down' && s.e.level >= 2)
  if (ups.length > 0) {
    const where = whereStates(names(ups)).inText
    const verb = ups.some((s) => s.big) ? 'surge' : 'climb'
    const top = ups[0]
    const topBench = top.f.r !== null ? benchmark(top.f.r) : 'above the usual'
    const sameBand = ups.filter((s) => s.f.r !== null && benchmark(s.f.r) === topBench).slice(0, 2)
    const short = `Fires ${verb} ${where}`
    // Naming at most two states for the benchmark; a pair already named in `where` isn't named twice.
    const tail = ups.length <= 2 ? (sameBand.length === ups.length ? topBench : `${topBench} in ${top.f.state}`) : `${topBench} in ${listText(names(sameBand))}`
    return { clause: { short, full: `${short}, ${tail}` }, places: placesOf(names(ups)), tier: 2 }
  }
  if (downs.length > 0) {
    const short = `Fires dip ${whereStates(names(downs)).inText}`
    const allAbove = downs.every((s) => aboveNorm(s.e))
    return { clause: { short, full: allAbove ? `${short}, still above usual` : short }, places: placesOf(names(downs)), tier: 2 }
  }
  const where = whereStates(names(pool)).inText
  const t = `Fires ${pool.every((s) => aboveNorm(s.e)) ? 'stay above usual' : 'continue'} ${where}`
  return { clause: { full: t, short: t }, places: placesOf(names(pool)), tier: 1 }
}

/**
 * The state's count against the district count a day earlier, then the benchmark, sourced once: "Satellites
 * picked up fires in 9 Telangana districts yesterday, down from 15 on Monday. That's still about one and a
 * half times what late November usually sees." Cluster counts stay in the figures strip.
 */
function storySentences(s: FireStory, ctx: CopyContext): string {
  const { f } = s
  if (f.n === 0) return `NASA's fire satellites saw no fires in ${f.state} ${f.day}.`
  const districts = f.districts > 0 ? `${f.districts} ${f.state} ${f.districts === 1 ? 'district' : 'districts'}` : f.state
  let first: string
  if (s.record || s.tie) {
    // The same measure as the headline: a record day is about the day's fires, so no district comparison.
    const than = s.record ? `more fires in ${f.state} ${f.day} than on any` : `as many fires in ${f.state} ${f.day} as on the busiest`
    first = `Satellites picked up ${than} ${hyphen(f.period)} day in ${yearsOf(f.span)}${f.districts > 0 ? `, across ${f.districts} ${f.districts === 1 ? 'district' : 'districts'}` : ''}`
  } else {
    first = `Satellites picked up fires in ${districts} ${f.day}`
    // The district count against the day before, only when it points the way the story does.
    const p = s.prev?.districts ?? 0
    const agrees = (s.dir === 'up' || s.spread) && f.districts > p ? 'up' : s.dir === 'down' && f.districts < p ? 'down' : null
    if (s.prev && agrees && p > 0) first += `, ${agrees} from ${p} ${relativeDay(s.prev.day, ctx.editionAt)}`
  }
  const out = [`${first}.`]
  if (f.r !== null && (f.counted || s.e.level < 2)) {
    const still = s.e.level >= 2 && (s.dir === 'down' || s.e.runChange === 'deescalated') ? ' still' : ''
    out.push(`That's${still} ${aboutWhatSees(f.r, f.period)}.`)
  }
  return out.join(' ')
}

/** The fire states that fell to seasonal levels in this edition's own run, when that is the story. */
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

function stateName(e: DeskEntry): string {
  return String(e.figures.state ?? e.title)
}

/** A state's own story: the move in the title, the districts and the benchmark in the standfirst. */
function fireStateCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const ff = e.figures
  const f = stateFacts(e, ctx)
  const near = (Array.isArray(ff.large_fires_near_people) ? ff.large_fires_near_people[0] : undefined) as NearFire | undefined
  const wildfire = (Array.isArray(ff.gdacs_wildfire) ? ff.gdacs_wildfire[0] : undefined) as WildfireAlert | undefined
  const story = fireStory(e, ctx)

  if (near?.place) {
    const where = near.district ? ` in ${near.district} district` : ''
    return {
      title: `A large fire burns ${Math.max(1, Math.round(near.km ?? 0))} km from ${near.place}`,
      standfirst:
        `NASA's fire satellites picked up a large fire${where}, close to a town of ${ctx.scale.fire.level4MinPopulation.toLocaleString('en-IN')} people or more. ` +
        storySentences(story, ctx),
    }
  }
  // Only an Orange or Red alert calls it a forest fire (the same rule as the Level 3 lift).
  if (wildfire && /^(orange|red)$/i.test(wildfire.alert_level ?? '') && (!f.counted || (ff.gdacs_level ?? 0) > (ff.ratio_level ?? 0))) {
    const colour = (wildfire.alert_level ?? '').toLowerCase()
    return {
      title: `Global monitors put a forest fire in ${f.state} on alert`,
      standfirst: `Global disaster monitors have a ${colour ? `${colour} ` : ''}forest-fire alert in ${f.state}. ${storySentences(story, ctx)}`,
    }
  }
  if (f.n === 0) return { title: `Satellites see no fires in ${f.state}`, standfirst: storySentences(story, ctx) }
  // A Level 1 state is a status line among the minor items, not a story (the first edition after it eased is Since yesterday's news).
  if (e.level === 1 && e.runChange !== 'deescalated') return { title: `${f.state}: fires at seasonal levels`, standfirst: null }
  if (!f.counted || e.level === 1) {
    const title = e.runChange === 'deescalated' ? `Fires in ${f.state} ease back to seasonal levels` : `Fires in ${f.state} are at seasonal levels`
    return { title, standfirst: storySentences(story, ctx) }
  }
  return { title: stateClause(story).full, standfirst: storySentences(story, ctx) }
}

/**
 * The fire roundup: one story for the fire states. Only the states still above usual are in it; those that
 * fell back are in Since yesterday, unless easing is the story. Several states say the direction, where,
 * and the benchmark for the strongest; a state busy within its usual range is a row, not a title.
 */
function roundupCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const above = e.members.filter((x) => x.level >= 2)
  const eased = fireEasing(ctx)

  if (eased) {
    const aboveNames = above.map(stateName)
    const title = `Fires ease back to seasonal levels ${whereStates(eased).inText}` + (aboveNames.length > 0 ? `, ${listText(aboveNames)} still above usual` : '')
    const sentences = [`${cap(listText(eased))} ${eased.length === 1 ? 'is' : 'are'} back to seasonal levels.`]
    if (above.length > 0) sentences.push(storySentences(fireStory(above[0], ctx), ctx))
    const others = above.slice(1).map(stateName)
    if (others.length > 0) sentences.push(`${listText(others)} ${others.length === 1 ? 'is' : 'are'} also still above usual.`)
    return { title, standfirst: sentences.join(' ') }
  }

  if (above.length === 0) {
    const names = e.members.map(stateName)
    return {
      // Only built in the edition whose own run lowered a state (entries.ts drops it after that).
      title: `Fires ease back to seasonal levels ${whereStates(names).inText}`,
      standfirst: `${listText(names)} ${names.length === 1 ? 'is' : 'are'} back to seasonal levels.`,
    }
  }
  if (above.length === 1) return fireStateCopy(above[0], ctx)

  const stories = above.map((x) => fireStory(x, ctx))
  const { clause } = groupClause(stories)
  // The standout leads the standfirst; the rest are named once, as also above usual.
  const standout = [...stories].sort((a, b) => Number(b.news) - Number(a.news) || Number(b.record) - Number(a.record) || byStrength(a, b))[0]
  const sentences = [storySentences(standout, ctx)]
  const others = stories.filter((x) => x !== standout).map((x) => x.f.state)
  if (others.length > 0) sentences.push(`${listText(others)} ${others.length === 1 ? 'is' : 'are'} also above usual.`)
  return { title: clause.full, standfirst: sentences.join(' ') }
}

/** A fire state's Since yesterday line: the move in words. */
function fireMoveText(m: Movement, e: DeskEntry): string {
  const state = stateName(e)
  switch (m.kind) {
    case 'new':
      return aboveNorm(e) ? `Fires climb above usual in ${state}` : `Fires climb in ${state}`
    case 'reopened':
      return `Fires climb again in ${state}`
    case 'escalated':
      return `Fires climb further in ${state}`
    case 'deescalated':
      return (m.to ?? 1) >= 2 ? `Fires dip in ${state}${aboveNorm(e) ? ', still above usual' : ''}` : `Fires in ${state} ease back to seasonal levels`
    case 'closed':
      return `Fires in ${state} have stayed at seasonal levels for two days`
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
      return `Fires in ${stateName(e)} have stayed at seasonal levels for two days`
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
    const where = whereStates(es.map(stateName)).inText
    const text = {
      new: `Fires climb ${es.every(aboveNorm) ? 'above usual ' : ''}${where}`,
      reopened: `Fires climb again ${where}`,
      escalated: `Fires climb further ${where}`,
      deescalated: ms.every((m) => m.to === 1) ? `Fires ease back to seasonal levels ${where}` : `Fires dip ${where}${es.every(aboveNorm) ? ', still above usual' : ''}`,
      closed: `Fires have stayed at seasonal levels for two days ${where}`,
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
      return `fires ${aboveNorm(e) ? 'stay above usual' : 'continue'} in ${stateName(e)}`
  }
}


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
  /** How newsworthy: 3 a record, 2 a change said for the first time (easing included), 1.5 a state after its record day, 1 a state that continues. */
  tier: number
  /** The clause without its benchmark, when two events share a headline. */
  short?: string
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
  const tier = (land && crossedJustNow) || fading || isRise(e.runChange) ? 2 : 1
  return { category: e.category, level: e.level, moved: !!move && move.kind !== 'closed', text, tier, places }
}

/**
 * The fire states as one event, only the ones with news: "fires climb in Gujarat for a third day, double the
 * usual for late October", "fires ease back to seasonal levels across central India", then "fires stay above
 * usual in Gujarat". `short` leaves the benchmark off for a headline that joins two events.
 */
function fireEvent(ctx: CopyContext): HeadEvent | null {
  const eased = fireEasing(ctx)
  const moves = (ctx.since?.moves ?? []).filter((m) => m.category === 'fire')
  const level = Math.max(1, ...ctx.fires.map((x) => x.level))
  if (eased) {
    const where = whereStates(eased).inText
    const text = `fires ease back to seasonal levels ${where}`
    return { category: 'fire', level, moved: moves.length > 0, tier: 2, text, short: `fires ease ${where}`, places: placesIn(where, eased.length) }
  }
  const stories = ctx.fires.map((x) => fireStory(x, ctx))
  if (!stories.some((s) => s.news)) return null
  const { clause, places, tier } = groupClause(stories)
  return { category: 'fire', level, moved: moves.length > 0, tier, text: lowerLead(clause.full), short: lowerLead(clause.short), places }
}

/** "Fires climb …" mid-sentence; a state's name keeps its capital. */
const lowerLead = (t: string) => (/^Fires /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

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
  return { category: 'air', level: e.level, moved: !!move && move.kind !== 'closed', tier: isRise(e.runChange) || e.runChange === 'deescalated' ? 2 : 1, text, places: a && !/cities$/.test(a.where) ? 1 : 0 }
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
  return { category: 'earthquake', level: e.level, moved: !!move && move.kind !== 'closed', tier: fresh || e.members.some((m) => isFresh(m.runChange)) ? 2 : 1, text, places: /near (?!India)/.test(text) ? 1 : 0 }
}

/** A flood as a clause: "flooding in Assam is on an orange alert", "worsens" only in the edition that reports it. */
function floodEvent(e: DeskEntry, ctx: CopyContext): HeadEvent {
  const move = ctx.since?.byItem.get(e.key)
  const colour = String(e.figures.episode_alert_level ?? e.figures.alert_level ?? '').toLowerCase()
  const verb = e.runChange === 'escalated' ? 'worsens' : e.runChange === 'deescalated' ? 'eases' : 'is on'
  const text = verb === 'is on' ? `${midName(floodName(e))} is on ${/^[aeiou]/.test(colour) ? 'an' : 'a'} ${colour} alert` : `${midName(floodName(e))} ${verb}`
  return { category: 'flood', level: e.level, moved: !!move && move.kind !== 'closed', tier: verb === 'is on' ? 1 : 2, text, places: 1 }
}

/** Every event of the edition that is worth a headline, most newsworthy first: level, then what moved, then category order. */
export function headEvents(entries: DeskEntry[], ctx: CopyContext): HeadEvent[] {
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
  // Level 3 and up lead by level; below that, newsworthiness (record, first-time change, continuing).
  const top = (x: HeadEvent) => (x.level >= 3 ? x.level : 0)
  return out.sort((a, b) => top(b) - top(a) || b.tier - a.tier || b.level - a.level || rank(a.category) - rank(b.category))
}

/**
 * The edition's headline: the main event, then optionally a second of another kind after
 * "as", if it fits in about twelve words and two places. Never about the report itself or
 * its bookkeeping (style guide, The page headline).
 */
export function pageHeadline(entries: DeskEntry[], ctx: CopyContext): string {
  const events = headEvents(entries, ctx)
  if (events.length === 0 || (events[0].level < 2 && events[0].tier < 2)) return quietHeadline(1)
  const [lead, ...rest] = events
  const one = cap(lead.text)
  const first = cap(lead.short ?? lead.text)
  // The first other event that fits in the words and places left; those that don't are dropped, not squeezed.
  for (const second of rest) {
    if (second.category === lead.category || lead.places + second.places > HEADLINE_PLACES) continue
    const both = `${first} as ${second.short ?? second.text}`
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
      ? 'fires are at seasonal levels across India'
      : fires.length === 1
        ? `fires in ${fires[0]} are back to seasonal levels`
        : `fires are back to seasonal levels in ${counted_(fires.length, 'state', 'states')}`,
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
            ? 'Fires are at seasonal levels across India.'
            : `Fires in ${listText(states)} ${states.length === 1 ? 'is' : 'are'} back to seasonal levels.`
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

