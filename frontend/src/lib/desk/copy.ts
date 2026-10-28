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
import type { AirBand, Edition, Level } from './types'
import {
  alertRank,
  alertRankWord,
  cap,
  inYears,
  listText,
  numberWord,
  partOfMonth,
  possessive,
  quakeStrength,
  relativeDay,
  roundKm,
  timesUsual,
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
  /** "in 2024 or 2025" */
  years: string
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
    years: inYears(typeof f.norm_years === 'string' ? f.norm_years : SCALE.fire.baselineYears),
  }
}

/** "more than on any day at this time of year in 2024 or 2025", or null. */
function recordClause(f: StateFacts): string | null {
  if (f.record === 'above') return `more than on any day at this time of year ${f.years}`
  if (f.record === 'equal') return `level with the busiest day at this time of year ${f.years}`
  return null
}

function baselineYears(e: DeskEntry): number {
  const [a, b] = String(e.figures.norm_years ?? SCALE.fire.baselineYears)
    .split(/[-–]/)
    .map(Number)
  return b ? b - a + 1 : 1
}

/** A state's story title: what happened, never the multiple (style guide). */
function stateTitle(e: DeskEntry, ctx: CopyContext): string {
  const f = stateFacts(e, ctx)
  const S = possessive(f.state)
  if (f.record === 'above' && f.counted) return `${S} fires spike to a ${numberWord(baselineYears(e))}-year high for the season`
  switch (e.change) {
    case 'opened':
      return `${S} fires jump well above normal`
    case 'reopened':
      return `${S} fires flare up again`
    case 'escalated':
      return `${S} fires climb further above normal`
    case 'deescalated':
      return e.level >= 2 ? `${S} fires ease but stay above normal` : `${S} fires fall back toward normal`
  }
  if (e.level === 1) return `${S} fires have fallen back toward normal`
  return `${S} fires run ${e.level >= 3 ? 'far' : 'well'} above normal`
}

/** A state's own story: the title, then the count with the multiple, once. */
function fireStateCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const ff = e.figures
  const f = stateFacts(e, ctx)
  const near = (Array.isArray(ff.large_fires_near_people) ? ff.large_fires_near_people[0] : undefined) as NearFire | undefined
  const wildfire = (Array.isArray(ff.gdacs_wildfire) ? ff.gdacs_wildfire[0] : undefined) as WildfireAlert | undefined
  const count =
    f.counted && f.r !== null
      ? `${plural(f.n, 'fire', 'fires')} ${f.day} across ${counted_(f.districts, 'district', 'districts')}, ${timesUsual(f.r)} for ${f.period}.`
      : null
  const rc = recordClause(f)
  const context = rc ? ` That's ${rc}.` : f.record === 'within' ? " That's within its range for the season." : ''

  if (near?.place) {
    const where = near.district ? ` in ${near.district} district` : ''
    return {
      title: `A large fire burns ${Math.max(1, Math.round(near.km ?? 0))} km from ${near.place}`,
      standfirst:
        `NASA's fire satellites picked up a large fire${where}, close to a town of ${SCALE.fire.level4MinPopulation.toLocaleString('en-IN')} people or more.` +
        (count ? ` ${f.state} had ${count}` : ''),
    }
  }
  if (wildfire && (!f.counted || (ff.gdacs_level ?? 0) > (ff.ratio_level ?? 0))) {
    const colour = (wildfire.alert_level ?? '').toLowerCase()
    return {
      title: `Global monitors put a forest fire in ${f.state} on alert`,
      standfirst:
        `Global disaster monitors have a ${colour ? `${colour} ` : ''}forest-fire alert in ${f.state}.` +
        (count ? ` NASA's fire satellites counted ${count}` : ''),
    }
  }
  if (f.n === 0) return { title: `Satellites see no fires in ${f.state}`, standfirst: `NASA's fire satellites saw none ${f.day}.` }
  if (!f.counted) {
    return {
      title: `${f.state} is down to ${plural(f.n, 'fire', 'fires')}`,
      standfirst: `${plural(f.n, 'fire', 'fires')} ${f.day}, too few to compare with past years: levels count from ${SCALE.fire.minFireEvents} fires a day.`,
    }
  }
  return { title: stateTitle(e, ctx), standfirst: count ? cap(count) + context : null }
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

/** The fire roundup: one story for the fire states, led by the strongest angle. */
function roundupCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const above = e.members.filter((x) => x.level >= 2)
  const below = e.members.filter((x) => x.level < 2)
  const backNames = below.map(stateName)
  const back = backNames.length > 0 ? `${listText(backNames)} ${backNames.length === 1 ? 'has' : 'have'} fallen back toward normal` : null

  if (above.length === 0) {
    return {
      title: `Fires fall back toward normal in ${counted_(e.members.length, 'state', 'states')}`,
      standfirst: `${cap(back!)}; a state leaves the list after two quieter days.`,
    }
  }
  if (above.length === 1) {
    const one = fireStateCopy(above[0], ctx)
    return { title: one.title, standfirst: [one.standfirst, back ? `${cap(back)}.` : null].filter(Boolean).join(' ') }
  }

  const also = ctx.ownFires.some((x) => x.level >= 2)
  const angle = fireAngle(above, ctx, !also)
  const base = also
    ? `Fires also run above normal in ${counted_(above.length, 'more state', 'more states')}`
    : `Fires run above normal in ${counted_(above.length, 'state', 'states')}`
  const title = `${base}, ${angleSuffix(angle)}`

  // The standout: the state the angle names, else the furthest above normal.
  const standout = angle.kind === 'record' || angle.kind === 'new' ? angle.states[0] : above[0]
  const sf = stateFacts(standout, ctx)
  const who = isNewChange(standout) ? `${sf.state}, newly above normal,` : sf.state
  const rc = recordClause(sf)
  const sentences = [
    sf.r !== null
      ? `${who} had ${plural(sf.n, 'fire', 'fires')} ${sf.day}, ${timesUsual(sf.r)} for ${sf.period}${rc ? ` and ${rc}` : ''}.`
      : `${who} had ${plural(sf.n, 'fire', 'fires')} ${sf.day}.`,
  ]
  const byCount = [...above].sort((a, b) => stateFacts(b, ctx).n - stateFacts(a, ctx).n)
  const biggest = byCount[0] !== standout && stateFacts(byCount[0], ctx).n > stateFacts(byCount[1], ctx).n ? byCount[0] : null
  if (biggest) {
    const bf = stateFacts(biggest, ctx)
    const brc = recordClause(bf)
    sentences.push(
      `${bf.state} had the most, with ${bf.n}` +
        (brc ? `, also ${brc}` : bf.record === 'within' ? ", though that's within its range for the season" : '') +
        '.',
    )
  }
  const others = above.filter((x) => x !== standout && x !== biggest).map(stateName)
  const tail = [
    others.length > 0 ? `${listText(others)} ${others.length === 1 ? 'is' : 'are'} also above normal` : null,
    back,
  ].filter(Boolean) as string[]
  if (tail.length > 0) sentences.push(`${cap(tail.join('; '))}.`)
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
      return `${S} fires drop off the list after two quieter days`
  }
}

// --- air -----------------------------------------------------------------------------

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

  const w = worst[0]
  const at = w.state ? `${w.city}, in ${w.state},` : w.city
  const sentences: string[] = []
  if (typeof w.aqi === 'number') {
    sentences.push(
      `${at} is worst, at ${w.aqi} on India's air quality index, which the Central Pollution Control Board rates ${BAND_WORDS[w.band]}.`,
    )
  } else {
    const pm25 = typeof w.pm25_24h === 'number'
    const v = Math.round((pm25 ? w.pm25_24h : w.pm10_24h) ?? 0)
    const what = pm25 ? 'fine-particle pollution (PM2.5)' : 'coarse dust (PM10)'
    sentences.push(`${at} is worst, with ${what} averaging ${v} µg/m³ over a day, ${BAND_WORDS[w.band]} on India's scale.`)
  }
  const others: string[] = []
  const alsoTop = inTop.slice(1)
  if (alsoTop.length > 0) {
    others.push(
      alsoTop.length <= 2
        ? `${listText(alsoTop.map((x) => x.city))} ${alsoTop.length === 1 ? 'is' : 'are'} also ${BAND_WORDS[top]}`
        : `${counted_(alsoTop.length, 'more city is', 'more cities are')} also ${BAND_WORDS[top]}`,
    )
  }
  const lower: AirBand[] = top === 'severe' ? ['very_poor', 'poor'] : top === 'very_poor' ? ['poor'] : []
  for (const b of lower) {
    const k = c[b] ?? 0
    if (k > 0) others.push(`${counted_(k, 'more city is', 'more cities are')} ${BAND_WORDS[b]}`)
  }
  if (others.length > 0) {
    const out = typeof f.cities_reporting === 'number' ? `, out of ${f.cities_reporting} reporting` : ''
    sentences.push(`${cap(others.join(', and '))}${out}.`)
  }
  if (Array.isArray(f.severe_unconfirmed) && f.severe_unconfirmed.length > 0) {
    sentences.push(`${listText(f.severe_unconfirmed)} read severe, but a city counts as severe only after two reports in a row.`)
  }
  sentences.push(
    f.source === 'openaq' || f.approximate
      ? "These are Sentinel's estimates from public monitors on OpenAQ, not official readings."
      : "These are the board's live readings, before its own checks.",
  )
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
  const parts = [`The magnitude ${m.toFixed(1)} quake struck ${p.phrase ?? quakeWhere(e)}${depth}, according to the US Geological Survey.`]
  if (f.usgs_alert) {
    const rank = alertRankWord(f.usgs_alert)
    parts.push(`Its alert for likely impact is ${f.usgs_alert.toLowerCase()}${rank ? `, the ${rank} of four` : ''}.`)
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
  let s = `Global disaster monitors give it ${alertRank(now, 'their')}${wind}.`
  if (f.rising) s += ' Its alert score went up in their latest update.'
  if ((COLOUR_RANK[peak] ?? 0) > (COLOUR_RANK[now] ?? 0)) s += ` It was rated ${peak} earlier.`
  return s
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
      return `${possessive(stateName(e))} fires drop off the list after two quieter days`
    case 'earthquake':
      return `The ${quakeStrength(e.figures.magnitude ?? e.strength)} earthquake ${quakeWhere(e)} leaves the report after two days`
    case 'cyclone':
      return `${cycloneName(e.title)} is off the global disaster monitors' list`
    case 'flood':
      return `${floodName(e)} is off the global disaster monitors' list`
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

/** The Since yesterday list, in the order of the moves (new, back, up, down, closed). */
export function sinceLines(entries: DeskEntry[], ctx: CopyContext): SinceLine[] {
  if (!ctx.since) return []
  const byId = new Map<string, DeskEntry>()
  for (const e of entries) for (const x of e.members.length ? e.members : [e]) byId.set(x.key, x)
  return ctx.since.moves.map((m) => ({
    key: m.itemId,
    kind: m.kind,
    ...movementLine(m, byId.get(m.itemId) ?? snapshotEntry(m.snapshot), ctx),
  }))
}

// --- the page headline ---------------------------------------------------------------

const LEVEL_ADJECTIVE: Partial<Record<Level, string>> = { 4: 'severe', 3: 'strong' }

/** The top item as the subject of "… is the top story today". */
function leadSubject(e: DeskEntry): { text: string; plural: boolean } {
  const f = e.figures
  const adj = LEVEL_ADJECTIVE[e.level]
  switch (e.category) {
    case 'cyclone':
      return { text: adj ? `a ${adj} cyclone` : cycloneName(e.title), plural: false }
    case 'flood':
      return { text: `${e.level >= 4 ? 'severe ' : e.level === 3 ? 'serious ' : ''}${floodName(e).replace(/^Flooding/, 'flooding')}`, plural: false }
    case 'earthquake':
      return e.members.length > 0
        ? { text: `${numberWord(e.members.length)} small earthquakes`, plural: true }
        : { text: `a ${quakeStrength(f.magnitude ?? e.strength)} earthquake ${quakeWhere(e)}`, plural: false }
    case 'air': {
      const a = airWorst(e)
      return { text: a ? `${a.band} air in ${a.where}` : 'poor air', plural: false }
    }
    case 'fire':
      return { text: `${possessive(stateName(e))} fires`, plural: true }
  }
}

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

/** A second item as a clause: "air is very poor in Panipat". */
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
      return `${name} is on a ${colour} alert`
    }
    case 'fire':
      return `${possessive(stateName(e))} fires are ${e.level >= 3 ? 'far' : 'well'} above normal`
  }
}

/** How the fire states moved since the edition a day earlier: more, fewer, the same, or unknown. */
function fireTrend(ctx: CopyContext): 'more' | 'fewer' | 'same' | null {
  const before = firesBefore(ctx)
  if (before === null) return null
  return ctx.fires.length > before ? 'more' : ctx.fires.length < before ? 'fewer' : 'same'
}

/** "spreading across central India", "far above normal in four states" */
function firesPhrase(ctx: CopyContext): string {
  const where = whereStates(ctx.fires.map((e) => String(e.figures.state ?? e.title)))
  const trend = fireTrend(ctx)
  if (trend === 'more') return `spreading ${where.spreadText}`
  if (trend === 'fewer') return `easing but still above normal ${where.inText}`
  const far = (ctx.fires[0]?.strength ?? 0) >= SCALE.fire.level3MinRatio ? 'far' : 'well'
  return `${far} above normal ${where.inText}`
}

/** The edition's headline: the top story, then the next thing a reader should know. */
export function pageHeadline(entries: DeskEntry[], ctx: CopyContext): string {
  if (entries.length === 0) return 'A quiet day: there is nothing in this report.'
  const lead = entries[0]
  if (lead.level === 1) return 'A quiet day: nothing in this report is above minor.'

  if (lead.category === 'fire' && ctx.fires.length >= 2) {
    const angle = fireAngle(ctx.fires, ctx, false)
    const other = entries.find((e) => e.category !== 'fire' && e.level >= 2)
    return `Fires are the top story today, ${firesPhrase(ctx)}, ${angleSuffix(angle)}.` + (other ? ` ${cap(itemClause(other))}.` : '')
  }

  const s = leadSubject(lead)
  const head = `${cap(s.text)} ${s.plural ? 'are' : 'is'} the top story today`
  const fireLead = lead.category === 'fire'
  if (!fireLead && ctx.fires.length >= 2) return `${head}, and fires are ${firesPhrase(ctx)}.`
  const other = entries.find((e) => e !== lead && e.level >= 2 && (e.category !== 'fire' || ctx.fires.length === 1))
  return other ? `${head}, and ${itemClause(other)}.` : `${head}.`
}
