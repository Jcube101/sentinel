// "Since yesterday": how the desk moved between the edition about a day
// earlier and this one. Built only from snapshots up to the edition, so a
// past edition shows the changes as they stood when it was published.

import { editionTitle, snapshotStrength } from './entries'
import { dayBefore, istDay, istShortDate, istTime } from './ist'
import type { Category, Change, ChangeWindow, Edition, Level, Snapshot } from './types'

export type MoveKind = 'new' | 'reopened' | 'escalated' | 'deescalated' | 'closed'

export const MOVE_ORDER: MoveKind[] = ['new', 'reopened', 'escalated', 'deescalated', 'closed']

/** How far before an edition "yesterday" starts: a day, less an hour for late runs. */
export const WINDOW_HOURS = 23

export interface Movement {
  kind: MoveKind
  itemId: string
  category: Category
  /** The level a day earlier (escalated, de-escalated), or the level it closed at. */
  from: Level | null
  /** The level in this edition; null for closed items. */
  to: Level | null
  /** The item's snapshot in this edition, or its closing snapshot. */
  snapshot: Snapshot
}

export interface SinceYesterday {
  ref: ChangeWindow['ref']
  /** Each item's level in the reference edition (open items only). */
  refLevels: Map<string, Level>
  /** Ordered: new, reopened, escalated, de-escalated, closed; most severe first in each. */
  moves: Movement[]
  byItem: Map<string, Movement>
  counts: Record<MoveKind, number>
}

/**
 * Compares the edition with the one about a day earlier (window.ref).
 *
 * An item open now is new or reopened if it opened or reopened after ref,
 * escalated or de-escalated if its level now differs from its level at ref
 * (the net change: up and back down again is no change). An item closed
 * after ref and not open now is closed.
 */
export function sinceYesterday(edition: Snapshot[], window: ChangeWindow): SinceYesterday {
  const refId = window.ref?.id ?? null
  const levelAtRef = new Map<string, Level>()
  const changes = new Map<string, Change[]>()
  const note = (itemId: string, change: Change | null) => {
    if (change) changes.set(itemId, [...(changes.get(itemId) ?? []), change])
  }
  for (const r of [...window.rows].sort((a, b) => a.run_id - b.run_id)) {
    if (r.run_id === refId) {
      if (r.status === 'open') levelAtRef.set(r.item_id, r.severity_level)
    } else {
      note(r.item_id, r.change)
    }
  }
  // A snapshot carried over from an earlier edition (its stage failed) has no change of its own here.
  for (const s of edition) if (s.carried_from === undefined) note(s.item_id, s.change)

  const moves: Movement[] = []
  const openNow = new Set<string>()
  for (const s of edition) {
    if (s.status !== 'open') continue
    openNow.add(s.item_id)
    const cs = changes.get(s.item_id) ?? []
    const base = { itemId: s.item_id, category: s.category, to: s.severity_level, snapshot: s }
    if (cs.includes('opened')) moves.push({ ...base, kind: 'new', from: null })
    else if (cs.includes('reopened')) moves.push({ ...base, kind: 'reopened', from: null })
    else {
      const from = levelAtRef.get(s.item_id)
      if (from !== undefined && from < s.severity_level) moves.push({ ...base, kind: 'escalated', from })
      if (from !== undefined && from > s.severity_level) moves.push({ ...base, kind: 'deescalated', from })
    }
  }

  // Closing snapshots after ref: the window's, then this edition's own.
  const closing = new Map<string, Snapshot>()
  for (const s of [...window.closed, ...edition.filter((x) => x.change === 'closed')]) {
    if (refId !== null && s.run_id <= refId) continue
    const prev = closing.get(s.item_id)
    if (!prev || s.run_id > prev.run_id) closing.set(s.item_id, s)
  }
  for (const s of closing.values()) {
    if (openNow.has(s.item_id)) continue
    moves.push({ kind: 'closed', itemId: s.item_id, category: s.category, from: s.severity_level, to: null, snapshot: s })
  }

  moves.sort(
    (a, b) =>
      MOVE_ORDER.indexOf(a.kind) - MOVE_ORDER.indexOf(b.kind) ||
      (b.to ?? b.from ?? 0) - (a.to ?? a.from ?? 0) ||
      snapshotStrength(b.snapshot) - snapshotStrength(a.snapshot) ||
      (editionTitle(a.snapshot) < editionTitle(b.snapshot) ? -1 : 1),
  )
  const counts = { new: 0, reopened: 0, escalated: 0, deescalated: 0, closed: 0 }
  for (const m of moves) counts[m.kind] += 1
  return { ref: window.ref, refLevels: levelAtRef, moves, byItem: new Map(moves.map((m) => [m.itemId, m])), counts }
}

/** "Since yesterday 20:30", or "Since 24 Oct 20:30" when the reference edition is older. */
export function sinceLabel(ref: ChangeWindow['ref'], run: Pick<Edition, 'started_at'>): string {
  if (!ref) return 'Since the desk started'
  if (istDay(ref.started_at) === dayBefore(istDay(run.started_at))) return `Since yesterday ${istTime(ref.started_at)}`
  return `Since ${istShortDate(ref.started_at)} ${istTime(ref.started_at)}`
}
