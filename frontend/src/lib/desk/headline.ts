// The numbers beside the headline: rows per level and changes since yesterday.
// The headline's words are in copy.ts.

import type { DeskEntry } from './entries'
import type { SinceYesterday } from './changes'
import type { Level } from './types'

/** A ratio as the pipeline prints it in reasons (evidence only): 9.07×, 12×. */
export function ratioText(r: number): string {
  return r < 10 ? r.toFixed(2) : r.toFixed(0)
}

/** How many desk rows sit at each level (a group of quakes is one row). */
export function levelCounts(entries: DeskEntry[]): Record<Level, number> {
  const out: Record<Level, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const e of entries) out[e.level] += 1
  return out
}

/** "1 new · 2 up · 3 closed" (counts above zero only), or null. */
export function changeCounts(since: SinceYesterday): string | null {
  const c = since.counts
  const parts: string[] = []
  if (c.new + c.reopened > 0) parts.push(`${c.new + c.reopened} new`)
  if (c.escalated > 0) parts.push(`${c.escalated} up`)
  if (c.deescalated > 0) parts.push(`${c.deescalated} down`)
  if (c.closed > 0) parts.push(`${c.closed} closed`)
  return parts.length > 0 ? parts.join(' · ') : null
}
