// An edition's items as map markers, and the day its fire layer shows.

import { itemCopy, closedLine, type CopyContext } from './copy'
import { snapshotEntry, type DeskEntry } from './entries'
import type { Edition, Snapshot } from './types'
import { dayBefore } from './ist'
import type { MapItem } from '@/components/paper/PaperMap'

/**
 * Markers for the edition's open items that have a position as of that
 * edition (DeskEntry.coords), numbered by desk row. Air has no position (P5);
 * a fire state's position is the centre of its fires that day.
 */
export function mapItems(entries: DeskEntry[], ctx: CopyContext): MapItem[] {
  const out: MapItem[] = []
  entries.forEach((row, i) => {
    for (const e of row.members.length > 0 ? row.members : [row]) {
      if (!e.coords) continue
      const title = row.members.length > 0 && row.category === 'fire' ? `${e.figures.state}: ${e.figures.fire_events ?? 0} fires` : itemCopy(e, ctx).title
      out.push({ key: e.key, number: i + 1, level: e.level, lat: e.coords[0], lon: e.coords[1], title, closed: false })
    }
  })
  return out
}

/** Closed items as hollow markers, from their closing snapshots. */
export function closedMapItems(closed: Snapshot[]): MapItem[] {
  return closed.flatMap((s) => {
    const e = snapshotEntry(s)
    return e.coords ? [{ key: e.key, number: null, level: e.level, lat: e.coords[0], lon: e.coords[1], title: closedLine(e), closed: true }] : []
  })
}

/** The fire day an edition levelled on: its fire items' day, else the UTC day before its run. */
export function fireDayOf(snapshots: Snapshot[], run: Pick<Edition, 'started_at'>): string {
  const day = snapshots.find((s) => s.category === 'fire' && typeof s.figures?.day === 'string')?.figures.day
  return typeof day === 'string' ? day : dayBefore(run.started_at.slice(0, 10))
}

