// Turns an edition's snapshots into the ranked list the desk prints.

import { SCALE } from './scale'
import { splitReason, type ReasonNote } from './levels'
import type { Movement } from './changes'
import type { AirBand, AirCity, Category, CategoryStatus, Change, Figures, Level, Snapshot } from './types'

export interface DeskEntry {
  key: string
  itemIds: string[]
  category: Category
  level: Level
  /** Fire items capped below their FIRMS level: the level they would have. */
  wouldBe: Level | null
  title: string
  /** The rule that set the level, without the notes the pipeline appends. */
  reason: string
  lastKnown: boolean
  /** Why the item is last-known, from the reason's note. */
  lastKnownWhy: string | null
  /**
   * When a last-known item's figures date from: a fire day key, the air
   * readings' time, or a carried snapshot's time; null if unknown.
   */
  asOf: string | null
  /** The pipeline's other notes, printed with the evidence (held levels and unconfirmed Severe cities go to the page's Notes). */
  notes: ReasonNote[]
  /**
   * The change since yesterday (when the desk has it), else the change in
   * this run alone. 'opened' prints as "+ New".
   */
  change: Change | null
  /** Escalated or de-escalated: the level a day earlier. */
  from: Level | null
  /** Grouped rows: how many members are new. */
  newMembers: number
  /** Tie-break inside a level, as watch.py ranks: fire ratio to norm, quake magnitude. */
  strength: number
  /** Grouped rows (Level 1 quakes) list their items here. */
  members: DeskEntry[]
  /** The snapshot's figures (a group: its largest member's). */
  figures: Figures
  placeName: string | null
  /** USGS / GDACS event id, e.g. "USGS-us6000u43g". */
  sourceRef: string | null
  /** Its stage failed in this run: figures from this earlier edition. */
  carriedFrom: number | null
  /**
   * [lat, lon] as of this edition, or null: the snapshot's own from edition
   * 29 (P1); before that desk_items' latest, only if no later run moved it.
   */
  coords: [number, number] | null
}

export const AIR_BANDS: AirBand[] = ['severe', 'very_poor', 'poor'] // worst first, as air.BANDS
export const AIR_BAND_LABELS: Record<AirBand, string> = { severe: 'Severe', very_poor: 'Very poor', poor: 'Poor' }

/** The band a city counts toward the level in (an unconfirmed Severe counts as Very poor). */
export function counted(city: AirCity): AirBand {
  return city.counted_as ?? city.band
}

/** The worst counted band among the cities, and the cities in it. */
export function airTop(f: Figures): { band: AirBand; cities: AirCity[] } | null {
  if (!Array.isArray(f.cities) || f.cities.length === 0) return null
  const band = AIR_BANDS.find((b) => f.cities!.some((c) => counted(c) === b))
  return band ? { band, cities: f.cities.filter((c) => counted(c) === band) } : null
}

/**
 * The item's title as that edition published it.
 *
 * From edition 29 the snapshot carries it (plan P1). Before that, desk_items
 * keeps only the current title, and fire and air titles change from run to
 * run, so they are rebuilt from the snapshot's own figures the way the
 * pipeline builds them (fire_desk.state_candidate, air.candidate,
 * desk.usgs_candidates).
 */
export function editionTitle(s: Snapshot): string {
  if (s.title) return s.title
  const f = s.figures ?? {}
  const current = s.desk_items?.title ?? s.item_id
  if (s.category === 'fire' && typeof f.state === 'string' && typeof f.district_count === 'number') {
    const k = f.district_count
    if (k > 0) return `Fire activity in ${k} ${f.state} district${k === 1 ? '' : 's'}`
    if (Array.isArray(f.gdacs_wildfire) && f.gdacs_wildfire.length > 0) return `Forest fire in ${f.state}`
    return `No fire activity in ${f.state}`
  }
  const top = s.category === 'air' ? airTop(f) : null
  if (top) {
    const where = top.cities.length === 1 ? top.cities[0].city : `${top.cities.length} cities`
    return `Air quality: ${AIR_BAND_LABELS[top.band].toLowerCase()} in ${where}`
  }
  if (s.category === 'earthquake' && typeof f.magnitude === 'number') {
    const place = placeOf(s)
    return `M${f.magnitude.toFixed(1)} earthquake` + (place ? `, ${place}` : '')
  }
  return current
}

/** The snapshot carries its own title, place and position (plan P1: edition 29 on). */
function ownPlace(s: Snapshot): boolean {
  return s.title != null
}

/** The item's place name as of the snapshot's run: its own from edition 29, else the item's current one. */
function placeOf(s: Snapshot): string | null {
  return ownPlace(s) ? (s.place_name ?? null) : (s.desk_items?.place_name ?? null)
}

/**
 * [lat, lon] as of the snapshot's run, or null. From edition 29 the snapshot
 * has its own. Before that, desk_items keeps only the latest position, so a
 * past edition gets it only if no later run moved it.
 */
function coordsOf(s: Snapshot): [number, number] | null {
  if (ownPlace(s)) return s.latitude != null && s.longitude != null ? [Number(s.latitude), Number(s.longitude)] : null
  const d = s.desk_items
  return d?.latitude != null && d?.longitude != null && d.last_run_id === s.run_id ? [Number(d.latitude), Number(d.longitude)] : null
}

/** Tie-break inside a level, the same as watch._strength: ratio to norm, else magnitude, else 0. */
export function snapshotStrength(s: Snapshot): number {
  const f = s.figures ?? {}
  return (typeof f.ratio_to_norm === 'number' && f.ratio_to_norm) || (typeof f.magnitude === 'number' && f.magnitude) || 0
}

/** A fire item held below its satellite level by the calibration cap: the level it would have. */
function heldAt(s: Snapshot): Level | null {
  const f = s.figures ?? {}
  return s.category === 'fire' && f.capped && typeof f.firms_level === 'number' && f.firms_level > s.severity_level
    ? (f.firms_level as Level)
    : null
}

/** When a snapshot's figures date from, for the "As of" kicker. */
function asOf(s: Snapshot): string | null {
  if (s.carried_from != null) return s.taken_at
  const f = s.figures ?? {}
  if (s.category === 'fire' && typeof f.day === 'string') return f.day
  if (s.category === 'air' && typeof f.data_as_of === 'string') return f.data_as_of
  return null
}

const MOVE_CHANGE: Record<Movement['kind'], Change> = {
  new: 'opened',
  reopened: 'reopened',
  escalated: 'escalated',
  deescalated: 'deescalated',
  closed: 'closed',
}

/** One snapshot as a desk row (closed items too, for Since yesterday). */
export function snapshotEntry(s: Snapshot, moves?: Map<string, Movement>): DeskEntry {
  return toEntry(s, moves)
}

function toEntry(s: Snapshot, moves?: Map<string, Movement>): DeskEntry {
  const { base, notes } = splitReason(s.severity_reason)
  const lastKnownNote = notes.find((n) => n.kind === 'last_known')
  const carried = s.carried_from ?? null
  const move = moves?.get(s.item_id)
  const why = carried !== null ? `the ${s.category} check failed; figures from No. ${carried}` : (lastKnownNote?.text ?? null)
  const stale = s.last_known || carried !== null
  return {
    key: s.item_id,
    itemIds: [s.item_id],
    category: s.category,
    level: s.severity_level,
    wouldBe: heldAt(s),
    title: editionTitle(s),
    reason: base,
    lastKnown: stale,
    lastKnownWhy: stale ? why : null,
    asOf: stale ? asOf(s) : null,
    notes: notes.filter((n) => n.kind === 'other'),
    change: moves ? (move ? MOVE_CHANGE[move.kind] : null) : carried !== null ? null : s.change,
    from: move?.from ?? null,
    newMembers: 0,
    strength: snapshotStrength(s),
    members: [],
    figures: s.figures ?? {},
    placeName: placeOf(s),
    sourceRef: s.desk_items?.source_ref ?? null,
    carriedFrom: carried,
    coords: coordsOf(s),
  }
}

/**
 * At the same level, categories in this order (Job, 28 Oct): their strengths
 * (fire ratio, quake magnitude) can't be compared with each other, and fire
 * is the one category that fills many rows at once.
 */
export const CATEGORY_ORDER: Category[] = ['cyclone', 'flood', 'earthquake', 'air', 'fire']

/** Level, then category, then strength, then title. Within a category, the order watch.py ranks in. */
export function compareEntries(a: DeskEntry, b: DeskEntry): number {
  if (a.level !== b.level) return b.level - a.level
  if (a.category !== b.category) return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
  if (a.strength !== b.strength) return b.strength - a.strength
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
}

export function isNew(change: Change | null): boolean {
  return change === 'opened' || change === 'reopened'
}

/** Two or more Level 1 quakes print as one row (decision 3 in the plan). */
function quakeGroup(quakes: DeskEntry[]): DeskEntry {
  const ranked = [...quakes].sort(compareEntries)
  const largest = ranked[0]
  const place = largest.title.includes(', ') ? largest.title.slice(largest.title.indexOf(', ') + 2) : null
  const stale = ranked.find((q) => q.lastKnown)
  return {
    key: 'earthquake:level-1',
    itemIds: ranked.map((q) => q.key),
    category: 'earthquake',
    level: 1,
    wouldBe: null,
    title:
      `${ranked.length} small earthquakes, the largest M${largest.strength.toFixed(1)}` + (place ? `, ${place}` : ''),
    reason: `None reached magnitude ${SCALE.quake.level2MinMagnitude} (USGS)`,
    lastKnown: stale !== undefined,
    lastKnownWhy: stale?.lastKnownWhy ?? null,
    asOf: stale?.asOf ?? null,
    notes: [],
    change: null,
    from: null,
    newMembers: ranked.filter((q) => isNew(q.change)).length,
    strength: largest.strength,
    members: ranked,
    figures: largest.figures,
    placeName: largest.placeName,
    sourceRef: null,
    carriedFrom: ranked.find((q) => q.carriedFrom !== null)?.carriedFrom ?? null,
    coords: null,
  }
}

export const FIRE_ROUNDUP_KEY = 'fire:roundup'

/**
 * The fire states as one desk row, ranked at its highest state's level
 * (Job, 28 Oct: one roundup, not five near-identical stories).
 */
function fireRoundup(states: DeskEntry[], ownStories: number): DeskEntry {
  const ranked = [...states].sort(compareEntries)
  const top = ranked[0]
  const capped = ranked.filter((x) => x.wouldBe !== null)
  const wouldBe = capped.length > 0 ? (Math.max(...capped.map((x) => x.wouldBe!)) as Level) : null
  const stale = ranked.find((x) => x.lastKnown)
  return {
    key: FIRE_ROUNDUP_KEY,
    itemIds: ranked.map((x) => x.key),
    category: 'fire',
    level: top.level,
    wouldBe: wouldBe !== null && wouldBe > top.level ? wouldBe : null,
    title: `Fire activity above normal in ${ranked.length} states` + (ownStories > 0 ? ' (more elsewhere)' : ''),
    reason: `${top.figures.state ?? top.title}: ${top.reason}`,
    lastKnown: stale !== undefined,
    lastKnownWhy: stale?.lastKnownWhy ?? null,
    asOf: stale?.asOf ?? null,
    notes: [],
    change: null,
    from: null,
    newMembers: ranked.filter((x) => isNew(x.change)).length,
    strength: top.strength,
    members: ranked,
    figures: top.figures,
    placeName: null,
    sourceRef: null,
    carriedFrom: ranked.find((x) => x.carriedFrom !== null)?.carriedFrom ?? null,
    coords: null,
  }
}

/**
 * The edition's open items, ranked. Level 1 quakes are grouped into one row;
 * fire states into one roundup, except a state at Level 3 or above, which
 * gets its own story, as does a state that is alone. With moves (since
 * yesterday), each item's change is its change over the day; without, its
 * change in this run alone.
 */
export function deskEntries(snapshots: Snapshot[], moves?: Map<string, Movement>): DeskEntry[] {
  let entries = snapshots.filter((s) => s.status === 'open').map((s) => toEntry(s, moves))

  const minorQuakes = entries.filter((e) => e.category === 'earthquake' && e.level === 1)
  if (minorQuakes.length >= 2) entries = [...entries.filter((e) => !minorQuakes.includes(e)), quakeGroup(minorQuakes)]

  const fires = entries.filter((e) => e.category === 'fire')
  const own = fires.filter((e) => e.level >= 3)
  const grouped = fires.filter((e) => e.level < 3)
  if (grouped.length >= 2) {
    entries = [...entries.filter((e) => !grouped.includes(e)), fireRoundup(grouped, own.length)]
  }
  return entries.sort(compareEntries)
}

/**
 * Categories whose stage failed in the run: category_status (built from the
 * items still open) counts more open items than the run has snapshots of.
 */
export function missingCategories(snapshots: Snapshot[], status: CategoryStatus[]): Category[] {
  return status
    .filter((c) => c.open_items > snapshots.filter((s) => s.category === c.category && s.status === 'open').length)
    .map((c) => c.category)
}
