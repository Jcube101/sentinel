// The quiet desk's history: the 14-day strip, how long it has been quiet,
// days since a Level 3+ item, and recently closed items. Built only from
// runs and snapshots up to the edition, so past editions print the same.

import { dayBefore, istDay } from './ist'
import type { DeskHistory, Edition, Level, TimedSnapshot } from './types'

export const STRIP_DAYS = 14

export interface StripDay {
  /** IST day key, "2026-10-28" */
  day: string
  /** The highest level open that day (0 = nothing open), or null when no edition ran. */
  level: Level | 0 | null
  /** The edition's own day: only its runs up to the edition count. */
  today: boolean
}

/** Days from one day key to another (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

/** The highest level per IST day over the 14 days up to the edition. */
export function stripDays(h: Pick<DeskHistory, 'runs' | 'strip'>, run: Pick<Edition, 'id' | 'started_at'>): StripDay[] {
  const today = istDay(run.started_at)
  const keys = [today]
  while (keys.length < STRIP_DAYS) keys.unshift(dayBefore(keys[0]))
  const dayOf = new Map(h.runs.filter((r) => r.id <= run.id).map((r) => [r.id, istDay(r.started_at)]))
  const max = new Map<string, Level | 0>()
  for (const day of dayOf.values()) if (!max.has(day)) max.set(day, 0)
  for (const s of h.strip) {
    const day = dayOf.get(s.run_id)
    if (day && s.severity_level > (max.get(day) ?? 0)) max.set(day, s.severity_level)
  }
  return keys.map((day) => ({ day, level: max.has(day) ? max.get(day)! : null, today: day === today }))
}

/** How many days in a row, ending today, nothing was above Level 1. A day without an edition ends the run. */
export function quietStreak(days: StripDay[]): number {
  let n = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const l = days[i].level
    if (l === null || l > 1) break
    n += 1
  }
  return n
}

function runDay(s: { pipeline_runs: { started_at: string } | null; taken_at?: string }): string {
  return istDay(s.pipeline_runs?.started_at ?? s.taken_at ?? '')
}

/** Whole days from the last Level 3+ snapshot to the edition, or null if there never was one. */
export function daysSinceLevel3(last: TimedSnapshot | null, run: Pick<Edition, 'started_at'>): number | null {
  return last ? daysBetween(runDay(last), istDay(run.started_at)) : null
}

export interface ClosedSummary {
  snapshot: TimedSnapshot
  /** IST day it closed. */
  closedOn: string
  /** The highest level it reached. */
  peak: Level
  /** Whole days from its latest opening to its closing. */
  daysOpen: number
}

/** Recently closed items, newest first: when, peak level, how long on the list. */
export function closedSummaries(h: Pick<DeskHistory, 'closed' | 'closedHistory'>): ClosedSummary[] {
  return h.closed.map((s) => {
    const rows = h.closedHistory.filter((r) => r.item_id === s.item_id && r.run_id <= s.run_id)
    const opened = [...rows].reverse().find((r) => r.change === 'opened' || r.change === 'reopened')
    const since = opened ? rows.filter((r) => r.run_id >= opened.run_id) : rows
    const peak = Math.max(s.severity_level, ...since.map((r) => r.severity_level)) as Level
    const closedOn = runDay(s)
    return { snapshot: s, closedOn, peak, daysOpen: opened ? daysBetween(runDay(opened), closedOn) : 0 }
  })
}
