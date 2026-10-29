// An edition's watching list from desk_watch_snapshots (plan P2: edition 29 on).

import type { Category, Level, WatchRow } from './types'

/** A desk_watch_snapshots row: one watch subject as it stood in one run, watching or not. */
export interface WatchSnapshot {
  run_id: number
  /** = desk_watch.id */
  subject_id: string
  category?: Category
  title?: string
  item_id?: string | null
  level?: Level
  next_level: Level | null
  metric?: string
  value: number | null
  next_threshold: number | null
  distance_to_threshold?: number | null
  rising_updates?: number
  watching?: boolean
  watch_reason?: string | null
  /** When the source last updated the value: a run without a new update repeats it. */
  source_updated_at: string | null
}

/** Source updates kept in a trend, as desk_watch.trend keeps. */
const TREND_POINTS = 10

/**
 * The run's watching subjects as WatchRows, closest to the next level first.
 * Each one's trend is its value at each source update, from the earlier runs'
 * rows up to this run's (a run without a new update adds nothing).
 */
export function watchRows(own: WatchSnapshot[], earlier: WatchSnapshot[]): WatchRow[] {
  const history = new Map<string, WatchSnapshot[]>()
  for (const r of [...earlier, ...own].sort((a, b) => a.run_id - b.run_id)) {
    history.set(r.subject_id, [...(history.get(r.subject_id) ?? []), r])
  }
  return own
    .filter((r) => r.watching)
    .map((r): WatchRow => {
      const trend: NonNullable<WatchRow['trend']> = []
      let last: string | null | undefined
      for (const h of history.get(r.subject_id) ?? []) {
        if (h.value === null) continue
        const at = h.source_updated_at ?? `run:${h.run_id}`
        if (at === last) continue
        last = at
        trend.push({ at, value: h.value, threshold: h.next_threshold, next_level: h.next_level })
      }
      return {
        id: r.subject_id,
        category: r.category!,
        title: r.title ?? r.subject_id,
        item_id: r.item_id ?? null,
        level: r.level!,
        next_level: r.next_level,
        metric: r.metric ?? '',
        value: r.value,
        next_threshold: r.next_threshold,
        distance_to_threshold: r.distance_to_threshold ?? null,
        trend: trend.slice(-TREND_POINTS),
        rising_updates: r.rising_updates ?? 0,
        watching: true,
        watch_reason: r.watch_reason ?? null,
        last_run_id: r.run_id,
      }
    })
    .sort((a, b) => (a.distance_to_threshold ?? Infinity) - (b.distance_to_threshold ?? Infinity))
}
