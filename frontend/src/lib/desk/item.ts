// The item page's history: a level strip over runs, the moves with a plain
// note each, and a state's fires per day. Up to the edition shown, so an
// archived item page reads as it did then.

import { snapshotEntry, airTop, AIR_BAND_LABELS, type DeskEntry } from './entries'
import { closedLine, quakeMemberLine } from './copy'
import { istDay } from './ist'
import type { Change, Level, TimedSnapshot } from './types'
import { timesUsual } from './words'
import { SCALE, minFireEvents } from './scale'

export const LEVEL_STRIP_RUNS = 30
export const FIRE_DAYS = 21

export interface LevelBar {
  runId: number
  level: Level
  lastKnown: boolean
  closed: boolean
}

/** One bar per run, the last 30 up to the shown snapshot. */
export function levelBars(snaps: TimedSnapshot[]): LevelBar[] {
  return snaps.slice(-LEVEL_STRIP_RUNS).map((s) => ({
    runId: s.run_id,
    level: s.severity_level,
    lastKnown: s.last_known,
    closed: s.status === 'closed',
  }))
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function dayText(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`))
}

/** What the item looked like in one run, in a few plain words (dates absolute: rows span many editions). */
export function snapshotNote(e: DeskEntry): string {
  const f = e.figures
  switch (e.category) {
    case 'fire': {
      const n = f.fire_events ?? 0
      const day = f.day ? ` on ${dayText(f.day)}` : ''
      const r = typeof f.ratio_to_norm === 'number' && n >= minFireEvents(f, SCALE) ? `, ${timesUsual(f.ratio_to_norm)}` : ''
      return `${n} ${n === 1 ? 'fire' : 'fires'}${day}${r}`
    }
    case 'air': {
      const top = airTop(f)
      if (!top) return 'No city poor or worse'
      const w = top.cities[0]
      const where = top.cities.length === 1 ? w.city : `${top.cities.length} cities`
      return `${AIR_BAND_LABELS[top.band]} in ${where}${typeof w.aqi === 'number' ? `, worst ${w.city} at ${w.aqi}` : ''}`
    }
    case 'earthquake':
      return quakeMemberLine(e)
    case 'cyclone':
    case 'flood': {
      const colour = String(f.episode_alert_level ?? f.alert_level ?? '').toLowerCase()
      const wind = typeof f.severity === 'number' && f.severity_unit === 'km/h' ? `, winds up to ${Math.round(f.severity)} km/h` : ''
      return `${colour ? `${colour[0].toUpperCase()}${colour.slice(1)} alert` : 'Alert'}${wind}`
    }
  }
}

export interface HistoryRow {
  runId: number
  at: string
  /** The change in that run, 'latest' for the shown snapshot, or 'last_known'. */
  kind: Change | 'latest' | 'last_known'
  level: Level
  note: string
}

/**
 * The item's moves, newest first: every run with a change, the runs where it
 * was last-known, and the shown snapshot itself.
 */
export function itemHistory(snaps: TimedSnapshot[]): HistoryRow[] {
  const rows: HistoryRow[] = []
  snaps.forEach((s, i) => {
    const latest = i === snaps.length - 1
    if (!s.change && !latest && !s.last_known) return
    const e = snapshotEntry(s)
    rows.push({
      runId: s.run_id,
      at: s.pipeline_runs?.started_at ?? s.taken_at,
      kind: s.change ?? (latest ? 'latest' : 'last_known'),
      level: s.severity_level,
      note: s.change === 'closed' ? closedLine(e) : snapshotNote(e),
    })
  })
  return rows.reverse()
}

/** When the item last opened or reopened, up to the shown snapshot. */
export function openSince(snaps: TimedSnapshot[]): string | null {
  const opened = [...snaps].reverse().find((s) => s.change === 'opened' || s.change === 'reopened')
  return opened ? (opened.pipeline_runs?.started_at ?? opened.taken_at) : null
}

export interface DayCount {
  /** UTC day key (FIRMS days are UTC). */
  day: string
  fires: number
}

/**
 * A state's fires per day up to the shown snapshot's day, at most 21 days:
 * fire_state_daily for the last 14 days, older days from snapshot figures,
 * and the shown day from the snapshot itself (what that edition counted).
 */
export function fireDays(
  shown: TimedSnapshot,
  daily: { acq_date: string; fire_events: number }[],
  snaps: TimedSnapshot[],
): DayCount[] {
  const last = shown.figures.day
  if (!last) return []
  const byDay = new Map<string, number>()
  for (const s of snaps) {
    const d = s.figures.day
    if (d && typeof s.figures.fire_events === 'number') byDay.set(d, s.figures.fire_events)
  }
  for (const r of daily) if (r.acq_date < last) byDay.set(r.acq_date, r.fire_events)
  byDay.set(last, shown.figures.fire_events ?? 0)
  return [...byDay.entries()]
    .filter(([d]) => d <= last)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-FIRE_DAYS)
    .map(([day, fires]) => ({ day, fires }))
}

/** The IST day an edition ran, for "Open since 21 Oct". */
export function runDay(at: string): string {
  return istDay(at)
}
