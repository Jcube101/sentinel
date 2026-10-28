// Turns an edition's snapshots into the ranked list the desk prints.

import { SCALE } from './scale'
import { splitReason, type ReasonNote } from './levels'
import type { AirBand, AirCity, Category, Change, Level, Snapshot } from './types'

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
  change: Change | null
  /** Grouped rows: how many members opened or reopened in this edition. */
  newMembers: number
  /** Tie-break inside a level, as watch.py ranks: fire ratio to norm, quake magnitude. */
  strength: number
  /** Grouped rows (Level 1 quakes) list their items here. */
  members: DeskEntry[]
}

const AIR_BANDS: AirBand[] = ['severe', 'very_poor', 'poor'] // worst first, as air.BANDS
const AIR_BAND_LABELS: Record<AirBand, string> = { severe: 'Severe', very_poor: 'Very poor', poor: 'Poor' }

function counted(city: AirCity): AirBand {
  return city.counted_as ?? city.band
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
  if (s.category === 'air' && Array.isArray(f.cities) && f.cities.length > 0) {
    const top = AIR_BANDS.find((b) => f.cities!.some((c) => counted(c) === b))
    if (top) {
      const inBand = f.cities.filter((c) => counted(c) === top)
      const where = inBand.length === 1 ? inBand[0].city : `${inBand.length} cities`
      return `Air quality: ${AIR_BAND_LABELS[top].toLowerCase()} in ${where}`
    }
  }
  if (s.category === 'earthquake' && typeof f.magnitude === 'number') {
    const place = s.desk_items?.place_name
    return `M${f.magnitude.toFixed(1)} earthquake` + (place ? `, ${place}` : '')
  }
  return current
}

function strength(s: Snapshot): number {
  const f = s.figures ?? {}
  // Same as watch._strength: ratio to norm, else magnitude, else 0.
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

function toEntry(s: Snapshot): DeskEntry {
  const { base, notes } = splitReason(s.severity_reason)
  const lastKnownNote = notes.find((n) => n.kind === 'last_known')
  const { labels: ls, wouldBe } = labels(s)
  return {
    key: s.item_id,
    itemIds: [s.item_id],
    category: s.category,
    level: s.severity_level,
    wouldBe,
    title: editionTitle(s),
    reason: base,
    labels: ls,
    lastKnown: s.last_known,
    lastKnownWhy: s.last_known ? (lastKnownNote?.text ?? null) : null,
    notes: notes.filter((n) => n.kind === 'severe_unconfirmed' || n.kind === 'other'),
    change: s.change,
    newMembers: 0,
    strength: strength(s),
    members: [],
  }
}

/** Level, then strength, then title: the order watch.py ranks open items in. */
export function compareEntries(a: DeskEntry, b: DeskEntry): number {
  if (a.level !== b.level) return b.level - a.level
  if (a.strength !== b.strength) return b.strength - a.strength
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0
}

function isNew(change: Change | null): boolean {
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
    newMembers: ranked.filter((q) => isNew(q.change)).length,
    strength: largest.strength,
    members: ranked,
  }
}

/** The edition's open items, ranked, with Level 1 quakes grouped into one row. */
export function deskEntries(snapshots: Snapshot[]): DeskEntry[] {
  const entries = snapshots.filter((s) => s.status === 'open').map(toEntry)
  const minorQuakes = entries.filter((e) => e.category === 'earthquake' && e.level === 1)
  if (minorQuakes.length < 2) return entries.sort(compareEntries)
  const rest = entries.filter((e) => !minorQuakes.includes(e))
  return [...rest, quakeGroup(minorQuakes)].sort(compareEntries)
}
