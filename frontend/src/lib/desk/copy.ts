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
  aboutCount,
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
  timesNormal,
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
  /** Fire states at Level 2 and up, highest ratio first. */
  fires: DeskEntry[]
  /** The fire state with clearly the most fires, if there are several. */
  mostFires: string | null
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
  const fires = entries
    .filter((e) => e.category === 'fire' && e.level >= 2)
    .sort((a, b) => b.strength - a.strength)
  let mostFires: string | null = null
  if (fires.length >= 2) {
    const byCount = [...fires].sort((a, b) => (b.figures.fire_events ?? 0) - (a.figures.fire_events ?? 0))
    if ((byCount[0].figures.fire_events ?? 0) > (byCount[1].figures.fire_events ?? 0)) mostFires = byCount[0].key
  }
  return { editionAt: run.started_at, since, fires, mostFires }
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

function fireCopy(e: DeskEntry, ctx: CopyContext): ItemCopy {
  const f = e.figures
  const state = typeof f.state === 'string' ? f.state : e.title
  const day = f.day ? relativeDay(f.day, ctx.editionAt) : ''
  const n = f.fire_events ?? 0
  const districts = f.district_count ?? 0
  const r = typeof f.ratio_to_norm === 'number' ? f.ratio_to_norm : null
  const counted = r !== null && n >= SCALE.fire.minFireEvents
  const near = (Array.isArray(f.large_fires_near_people) ? f.large_fires_near_people[0] : undefined) as NearFire | undefined
  const wildfire = (Array.isArray(f.gdacs_wildfire) ? f.gdacs_wildfire[0] : undefined) as WildfireAlert | undefined
  const states = numberWord(ctx.fires.length)
  const most = ctx.mostFires === e.key
  const mostInTitle = most && ctx.fires[0]?.key !== e.key && !e.change

  // How this day compares with the baseline's busiest day at this time of year.
  const max = typeof f.norm_max_daily_events === 'number' ? f.norm_max_daily_events : null
  const years = inYears(typeof f.norm_years === 'string' ? f.norm_years : SCALE.fire.baselineYears)
  const record = max === null ? null : n > max ? 'above' : n === max ? 'equal' : 'within'
  const context =
    record === 'above'
      ? ` That's more than on any day at this time of year ${years}.`
      : record === 'equal'
        ? ` That matches the busiest day at this time of year ${years}.`
        : record === 'within'
          ? " That's within its range for the season."
          : ''
  const count =
    counted && typeof f.norm_daily_events === 'number' && f.day
      ? `${plural(n, 'fire', 'fires')} ${day} across ${counted_(districts, 'district', 'districts')}` +
        (most && !mostInTitle ? `, the most of the ${states} states above normal` : '') +
        `, where ${partOfMonth(f.day)} usually sees ${aboutCount(f.norm_daily_events)}.${context}`
      : null

  if (near?.place) {
    const where = near.district ? ` in ${near.district} district` : ''
    return {
      title: `A large fire burns ${Math.max(1, Math.round(near.km ?? 0))} km from ${near.place}`,
      standfirst:
        `NASA's fire satellites picked up a large fire${where}, close to a town of ${SCALE.fire.level4MinPopulation.toLocaleString('en-IN')} people or more.` +
        (count ? ` ${state} had ${count}` : ''),
    }
  }
  if (wildfire && (!counted || (f.gdacs_level ?? 0) > (f.ratio_level ?? 0))) {
    const colour = (wildfire.alert_level ?? '').toLowerCase()
    return {
      title: `Global monitors put a forest fire in ${state} on alert`,
      standfirst:
        `Global disaster monitors have a ${colour ? `${colour} ` : ''}forest-fire alert in ${state}.` +
        (count ? ` NASA's fire satellites counted ${count}` : ''),
    }
  }
  if (n === 0) return { title: `Satellites see no fires in ${state}`, standfirst: `NASA's fire satellites saw none ${day}.` }
  if (!counted || r === null) {
    return {
      title: `${state} is down to ${plural(n, 'fire', 'fires')}`,
      standfirst: `${plural(n, 'fire', 'fires')} ${day}, too few to compare with past years: levels count from ${SCALE.fire.minFireEvents} fires a day.`,
    }
  }

  const S = possessive(state)
  let title: string
  switch (e.change) {
    case 'opened':
      title = `${S} fires jump to ${timesNormal(r)}`
      break
    case 'reopened':
      title = `${S} fires flare up again, at ${timesNormal(r)}`
      break
    case 'escalated':
      title = `${S} fires climb to ${timesNormal(r)}`
      break
    case 'deescalated':
      title = `${S} fires ease to ${timesNormal(r)}`
      break
    default:
      title = mostInTitle
        ? `${state} has the most fires of the ${states} states above normal`
        : e.level === 1
          ? `${S} fires are back under ${timesNormal(SCALE.fire.level2MinRatio)}`
          : `${S} fires run at ${timesNormal(r)}`
  }
  if (mostInTitle) {
    // The title has no multiple, so the standfirst gives it.
    const tail =
      record === 'above'
        ? `, and more than on any day at this time of year ${years}.`
        : record === 'within'
          ? ', though still within its range for the season.'
          : '.'
    return { title, standfirst: `${n} ${day}, ${timesUsual(r)}${tail}` }
  }
  return { title, standfirst: count ? cap(count) : null }
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
  if (e.members.length > 0) return quakeGroupCopy(e)
  switch (e.category) {
    case 'fire':
      return fireCopy(e, ctx)
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
      return `${possessive(String(e.figures.state ?? e.title))} fires have stayed under ${timesNormal(SCALE.fire.level2MinRatio)} for two days`
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
    case 'fire': {
      const r = f.ratio_to_norm
      const S = possessive(String(f.state ?? e.title))
      return { text: typeof r === 'number' ? `${S} fires, at ${timesNormal(r)},` : `${S} fires`, plural: true }
    }
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
      return `${possessive(String(f.state ?? e.title))} fires are at ${timesNormal(f.ratio_to_norm ?? 1)}`
  }
}

/** How the fire states moved since the edition a day earlier: more, fewer, the same, or unknown. */
function fireTrend(ctx: CopyContext): 'more' | 'fewer' | 'same' | null {
  const ref = ctx.since?.refLevels
  if (!ref || !ctx.since?.ref) return null
  const before = [...ref].filter(([id, level]) => id.startsWith('fire:') && level >= 2).length
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
    const top = ctx.fires[0]
    const led = `led by ${top.figures.state} at ${timesNormal(top.strength)}`
    const other = entries.find((e) => e.category !== 'fire' && e.level >= 2)
    return `Fires are the top story today, ${firesPhrase(ctx)}, ${led}.` + (other ? ` ${cap(itemClause(other))}.` : '')
  }

  const s = leadSubject(lead)
  const head = `${cap(s.text)} ${s.plural ? 'are' : 'is'} the top story today`
  const fireLead = lead.category === 'fire'
  if (!fireLead && ctx.fires.length >= 2) return `${head}, and fires are ${firesPhrase(ctx)}.`
  const other = entries.find((e) => e !== lead && e.level >= 2 && (e.category !== 'fire' || ctx.fires.length === 1))
  return other ? `${head}, and ${itemClause(other)}.` : `${head}.`
}
