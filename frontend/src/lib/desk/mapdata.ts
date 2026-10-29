// An edition's items as map markers, and the day its fire layer shows.

import { itemCopy, closedLine, type CopyContext } from './copy'
import { snapshotEntry, type DeskEntry } from './entries'
import type { Edition, Snapshot } from './types'
import { dayBefore } from './ist'
import type { FirePoint, MapItem } from '@/components/paper/PaperMap'

/** What sizes an item's map symbol: a cyclone's wind in km/h (quakes and floods are sized by level). */
function symbolStrength(e: DeskEntry): number | null {
  const f = e.figures
  if (e.category === 'cyclone') return typeof f.severity === 'number' && f.severity > 0 && f.severity_unit === 'km/h' ? f.severity : null
  return null
}

/** A Level 4 fire state's large fires near towns, as [lat, lon], to ring on the map (positions stored from edition 29). */
function ringedFires(e: DeskEntry): [number, number][] {
  const near = e.figures.large_fires_near_people
  if (e.category !== 'fire' || e.level < 4 || !Array.isArray(near)) return []
  return near.flatMap((x) => {
    const { latitude, longitude } = x as { latitude?: unknown; longitude?: unknown }
    return typeof latitude === 'number' && typeof longitude === 'number' ? [[latitude, longitude] as [number, number]] : []
  })
}

function marker(e: DeskEntry, number: number | null, title: string, closed: boolean): MapItem {
  return {
    key: e.key,
    category: e.category,
    strength: symbolStrength(e),
    state: e.category === 'fire' && typeof e.figures.state === 'string' ? e.figures.state : null,
    number,
    level: e.level,
    lat: e.coords![0],
    lon: e.coords![1],
    title,
    closed,
    ringed: ringedFires(e),
  }
}

/**
 * Markers for the edition's open items that have a position as of that
 * edition (DeskEntry.coords), numbered by desk row. Air has no position (P5);
 * a fire state's position is the centre of its fires that day.
 *
 * Only what the desk row is about gets its number (MapSymbols sheet): a fire
 * state at Level 1 is just its dots, no badge; a group of small quakes has
 * one badge, on its largest quake with a position.
 */
export function mapItems(entries: DeskEntry[], ctx: CopyContext): MapItem[] {
  const out: MapItem[] = []
  entries.forEach((row, i) => {
    const shown = (row.members.length > 0 ? row.members : [row]).filter((e) => e.coords && !(e.category === 'fire' && e.level < 2))
    // Members are ranked, largest first.
    const badged = row.category === 'earthquake' && row.members.length > 0 ? shown[0] : null
    for (const e of shown) {
      const title = row.members.length > 0 && row.category === 'fire' ? `${e.figures.state}: ${e.figures.fire_events ?? 0} fires` : itemCopy(e, ctx).title
      out.push(marker(e, badged && e !== badged ? null : i + 1, title, false))
    }
  })
  return out
}

/** Closed items as hollow markers, from their closing snapshots. */
export function closedMapItems(closed: Snapshot[]): MapItem[] {
  return closed.flatMap((s) => {
    const e = snapshotEntry(s)
    return e.coords ? [marker(e, null, closedLine(e), true)] : []
  })
}

/** The fire day an edition levelled on: its fire items' day, else the UTC day before its run. */
export function fireDayOf(snapshots: Snapshot[], run: Pick<Edition, 'started_at'>): string {
  const day = snapshots.find((s) => s.category === 'fire' && typeof s.figures?.day === 'string')?.figures.day
  return typeof day === 'string' ? day : dayBefore(run.started_at.slice(0, 10))
}

/** What an edition's fire layer shows: the fires of its fire day first seen by its FIRMS data time (null: the whole day). */
export interface FireLayer {
  day: string
  to: string | null
}

export function fireLayerOf(snapshots: Snapshot[], run: Pick<Edition, 'started_at'>): FireLayer {
  const to = snapshots.find((s) => s.category === 'fire' && typeof s.figures?.data_to === 'string')?.figures.data_to
  return { day: fireDayOf(snapshots, run), to: typeof to === 'string' ? to : null }
}

/** A fire_day_points row (P4): one UTC day's fire events, kept for good. */
export interface DayPointsRow {
  acq_date: string
  states: string[]
  /** [latitude, longitude, hotspots, frp_max, first_seen (minutes after 00:00 UTC), state (index into states)] */
  points: [number, number, number, number, number, number | null][]
}

/** A day's points as map fires, keeping those first seen by `to` (an ISO time); null keeps the whole day. */
export function dayPoints(row: DayPointsRow, to: string | null): FirePoint[] {
  const cut = to === null ? Infinity : Math.floor((Date.parse(to) - Date.parse(`${row.acq_date}T00:00:00Z`)) / 60_000)
  return row.points
    .filter((p) => p[4] <= cut && p[5] !== null)
    .map(([latitude, longitude, hotspot_count, frp_max, , s]) => ({
      latitude,
      longitude,
      hotspot_count,
      frp_max,
      district: null,
      state: row.states[s!] ?? null,
    }))
}

