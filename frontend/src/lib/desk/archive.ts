// The archive: which edition stands for each IST day, the day's highest
// level, and that edition's lead as it was printed. Built only from runs and
// snapshots up to each edition (plan section 2).

import { sinceYesterday, WINDOW_HOURS } from './changes'
import { copyContext, itemCopy, quietHeadline } from './copy'
import { deskEntries } from './entries'
import { istDay, istTime } from './ist'
import { SCALE } from './scale'
import type { Edition, Level, RunRef, Snapshot, SnapshotTrace } from './types'

/** The scheduled evening slot: the day's edition is the first run from this IST time on. */
export const EVENING = '20:30'

/** A run's slot in words: "02:30", "14:30", "20:30" for scheduled runs (allowing an hour's lateness), else its time. */
export function slotOf(at: string): string {
  const t = istTime(at)
  for (const slot of ['02:30', '14:30', '20:30']) {
    const [h, m] = slot.split(':').map(Number)
    const [th, tm] = t.split(':').map(Number)
    const late = th * 60 + tm - (h * 60 + m)
    if (late >= 0 && late < 60) return slot
  }
  return t
}

/** Finished runs grouped by IST day, each day's runs in start order. */
export function runsByDay(runs: RunRef[]): Map<string, RunRef[]> {
  const out = new Map<string, RunRef[]>()
  for (const r of [...runs].filter((x) => x.status !== 'running').sort((a, b) => a.id - b.id)) {
    const day = istDay(r.started_at)
    out.set(day, [...(out.get(day) ?? []), r])
  }
  return out
}

/**
 * The edition that stands for a day: the first that started at 20:30 IST or
 * later (the evening run, even if late); else the day's latest, flagged.
 */
export function chooseDayEdition(dayRuns: RunRef[]): { run: RunRef; evening: boolean } | null {
  if (dayRuns.length === 0) return null
  const evening = dayRuns.find((r) => istTime(r.started_at) >= EVENING)
  return evening ? { run: evening, evening: true } : { run: dayRuns[dayRuns.length - 1], evening: false }
}

/** The highest open level in any edition of each day (0 = nothing open). */
export function dayMaxLevels(runs: RunRef[], traces: Pick<SnapshotTrace, 'run_id' | 'status' | 'severity_level'>[]): Map<string, Level | 0> {
  const dayOf = new Map(runs.map((r) => [r.id, istDay(r.started_at)]))
  const out = new Map<string, Level | 0>()
  for (const day of dayOf.values()) out.set(day, 0)
  for (const t of traces) {
    const day = dayOf.get(t.run_id)
    if (day && t.status === 'open' && t.severity_level > (out.get(day) ?? 0)) out.set(day, t.severity_level)
  }
  return out
}

export interface ArchiveLead {
  level: Level | 0
  title: string
  /** The edition ran before the severity desk existed. */
  beforeDesk: boolean
}

/**
 * An edition's lead as the Desk printed it: its open snapshots, ranked, with
 * the change since the edition a day earlier from the slim rows in between.
 */
export function archiveLead(run: Pick<Edition, 'id' | 'started_at'>, open: Snapshot[], runs: RunRef[], traces: SnapshotTrace[]): ArchiveLead {
  if (run.id < SCALE.fromEdition) return { level: 0, title: 'Before the severity desk began', beforeDesk: true }
  const cutoff = Date.parse(run.started_at) - WINDOW_HOURS * 3600_000
  const ref = [...runs].filter((r) => r.status !== 'running' && Date.parse(r.started_at) <= cutoff).sort((a, b) => b.id - a.id)[0] ?? null
  const rows = traces.filter((t) => t.run_id >= (ref?.id ?? 1) && t.run_id < run.id)
  const since = sinceYesterday(open, { ref: ref ? { id: ref.id, started_at: ref.started_at } : null, rows, closed: [] })
  const entries = deskEntries(open, since.byItem)
  if (entries.length === 0 || entries[0].level <= 1) {
    return { level: entries[0]?.level ?? 0, title: quietHeadline(1), beforeDesk: false }
  }
  const ctx = copyContext(entries, since, run)
  return { level: entries[0].level, title: itemCopy(entries[0], ctx).title, beforeDesk: false }
}

/** "2026-10" for an IST day key or ISO time. */
export function monthOf(dayOrIso: string): string {
  return (dayOrIso.length === 10 ? dayOrIso : istDay(dayOrIso)).slice(0, 7)
}

/** Every day key in a month, newest first, limited to [from, to]. */
export function monthDays(month: string, from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${month}-01T12:00:00Z`)
  while (d.toISOString().slice(0, 7) === month) {
    const key = d.toISOString().slice(0, 10)
    if (key >= from && key <= to) out.push(key)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out.reverse()
}

/** The month before or after, "2026-10" → "2026-09" / "2026-11". */
export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-15T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + by)
  return d.toISOString().slice(0, 7)
}

/** A valid YYYY-MM-DD day key, or null. */
export function parseDay(s: string | undefined): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T12:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s
}

/** IST midnight at the start of a day, as an ISO time. */
export function dayStart(day: string): string {
  return `${day}T00:00:00+05:30`
}
