// Turns an edition's snapshots into the ranked list the desk prints.

import { SCALE } from './scale'
import { splitReason, type ReasonNote } from './levels'
import type { Movement } from './changes'
import type { AirBand, AirCity, Category, CategoryStatus, Change, Figures, Level, Snapshot } from './types'

export interface DeskLabel {
  kind: 'unvalidated' | 'approximate' | 'cap'
  text: string
}

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
  labels: DeskLabel[]
  lastKnown: boolean
  /** Why the item is last-known, from the reason's note. */
  lastKnownWhy: string | null
  /** Other notes worth printing (e.g. Severe cities not yet confirmed). */
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
 * desk_items keeps only the current title, and fire and air titles change
 * from run to run, so they are rebuilt from the snapshot's own figures the
 * way the pipeline builds them (fire_desk.state_candidate, air.candidate,
 * desk.usgs_candidates). Snapshots will carry the title themselves once the
 * pipeline adds it (plan P1).
 */
export function editionTitle(s: Snapshot): string {
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
    const place = s.desk_items?.place_name
    return `M${f.magnitude.toFixed(1)} earthquake` + (place ? `, ${place}` : '')
  }
  return current
}

/** Tie-break inside a level, the same as watch._strength: ratio to norm, else magnitude, else 0. */
export function snapshotStrength(s: Snapshot): number {
  const f = s.figures ?? {}
  return (typeof f.ratio_to_norm === 'number' && f.ratio_to_norm) || (typeof f.magnitude === 'number' && f.magnitude) || 0
}

function labels(s: Snapshot): { labels: DeskLabel[]; wouldBe: Level | null } {
  const f = s.figures ?? {}
  const out: DeskLabel[] = []
  let wouldBe: Level | null = null
  if (s.category === 'air') {
    if (f.source === 'datagov' || f.unvalidated) out.push({ kind: 'unvalidated', text: 'CPCB real-time · unvalidated' })
    else if (f.approximate) out.push({ kind: 'approximate', text: 'Approximate' })
  }
  if (s.category === 'fire' && f.capped && typeof f.firms_level === 'number' && f.firms_level > s.severity_level) {
    wouldBe = f.firms_level as Level
    out.push({ kind: 'cap', text: `Capped at L${s.severity_level} · would be L${wouldBe}` })
  }
  return { labels: out, wouldBe }
}

const MOVE_CHANGE: Record<Movement['kind'], Change> = {
  new: 'opened',
  reopened: 'reopened',
  escalated: 'escalated',
  deescalated: 'deescalated',
  closed: 'closed',
}

function toEntry(s: Snapshot, moves?: Map<string, Movement>): DeskEntry {
  const { base, notes } = splitReason(s.severity_reason)
  const lastKnownNote = notes.find((n) => n.kind === 'last_known')
  const { labels: ls, wouldBe } = labels(s)
  const carried = s.carried_from ?? null
  const move = moves?.get(s.item_id)
  const why = carried !== null ? `its stage failed in this run; figures from No. ${carried}` : (lastKnownNote?.text ?? null)
  return {
    key: s.item_id,
    itemIds: [s.item_id],
    category: s.category,
    level: s.severity_level,
    wouldBe,
    title: editionTitle(s),
    reason: base,
    labels: ls,
    lastKnown: s.last_known || carried !== null,
    lastKnownWhy: s.last_known || carried !== null ? why : null,
    notes: notes.filter((n) => n.kind === 'severe_unconfirmed' || n.kind === 'other'),
    change: moves ? (move ? MOVE_CHANGE[move.kind] : null) : carried !== null ? null : s.change,
    from: move?.from ?? null,
    newMembers: 0,
    strength: snapshotStrength(s),
    members: [],
    figures: s.figures ?? {},
    placeName: s.desk_items?.place_name ?? null,
    sourceRef: s.desk_items?.source_ref ?? null,
    carriedFrom: carried,
  }
}

/** Level, then strength, then title: the order watch.py ranks open items in. */
export function compareEntries(a: DeskEntry, b: DeskEntry): number {
  if (a.level !== b.level) return b.level - a.level
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
  const why = ranked.find((q) => q.lastKnownWhy)?.lastKnownWhy ?? null
  return {
    key: 'earthquake:level-1',
    itemIds: ranked.map((q) => q.key),
    category: 'earthquake',
    level: 1,
    wouldBe: null,
    title:
      `${ranked.length} small earthquakes, the largest M${largest.strength.toFixed(1)}` + (place ? `, ${place}` : ''),
    reason: `None reached M${SCALE.quake.level2MinMagnitude} (USGS)`,
    labels: [],
    lastKnown: ranked.some((q) => q.lastKnown),
    lastKnownWhy: why,
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
  }
}

/**
 * The edition's open items, ranked, with Level 1 quakes grouped into one row.
 * With moves (since yesterday), each item's change is its change over the
 * day; without, its change in this run alone.
 */
export function deskEntries(snapshots: Snapshot[], moves?: Map<string, Movement>): DeskEntry[] {
  const entries = snapshots.filter((s) => s.status === 'open').map((s) => toEntry(s, moves))
  const minorQuakes = entries.filter((e) => e.category === 'earthquake' && e.level === 1)
  if (minorQuakes.length < 2) return entries.sort(compareEntries)
  const rest = entries.filter((e) => !minorQuakes.includes(e))
  return [...rest, quakeGroup(minorQuakes)].sort(compareEntries)
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
