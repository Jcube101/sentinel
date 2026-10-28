// An edition's items as map markers, and the day its fire layer shows.

import { itemCopy, closedLine, type CopyContext } from './copy'
import { snapshotEntry, type DeskEntry } from './entries'
import type { Edition, Snapshot } from './types'
import { dayBefore } from './ist'
import type { MapItem } from '@/components/paper/PaperMap'

/** What sizes an item's map symbol: a cyclone's wind in km/h, a quake's magnitude. */
function symbolStrength(e: DeskEntry): number | null {
  const f = e.figures
  if (e.category === 'cyclone') return typeof f.severity === 'number' && f.severity > 0 && f.severity_unit === 'km/h' ? f.severity : null
  if (e.category === 'earthquake') return typeof f.magnitude === 'number' ? f.magnitude : null
  return null
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
  }
}

/**
 * Markers for the edition's open items that have a position as of that
 * edition (DeskEntry.coords), numbered by desk row. Air has no position (P5);
 * a fire state's position is the centre of its fires that day.
 */
export function mapItems(entries: DeskEntry[], ctx: CopyContext): MapItem[] {
  const out: MapItem[] = []
  entries.forEach((row, i) => {
    // Only what the desk row is about gets its number: in a fire roundup at
    // Level 2+, the states still above normal, not those back at Level 1.
    const members = row.members.filter((m) => row.category !== 'fire' || row.level < 2 || m.level >= 2)
    for (const e of row.members.length > 0 ? members : [row]) {
      if (!e.coords) continue
      const title = row.members.length > 0 && row.category === 'fire' ? `${e.figures.state}: ${e.figures.fire_events ?? 0} fires` : itemCopy(e, ctx).title
      out.push(marker(e, i + 1, title, false))
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

