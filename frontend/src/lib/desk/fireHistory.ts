// A state's recent fire days, read from the snapshots of earlier editions. The fire copy needs "up from 15
// on Monday", "for a third day" and "after a three-day surge": all of it from complete days before the
// edition's own, so a past edition prints the same words it did when it was published.

export interface FireDay {
  /** The fire day (UTC date). */
  day: string
  /** Fire clusters that day: used only to judge direction, never printed. */
  events: number
  districts: number
  ratio: number | null
  /** Enough clusters for the ratio to count. */
  counted: boolean
}

/** Item id ("fire:gujarat") to its fire days, oldest first, one per day. */
export type FireHistory = Map<string, FireDay[]>

/** A fire item's snapshot figures, flattened (the columns useFireHistory selects). */
export interface HistoryRow {
  run_id: number
  item_id: string
  day: string | null
  events: number | string | null
  districts: number | string | null
  ratio: number | string | null
  counted: boolean | string | null
}

const num = (v: number | string | null): number | null => (v === null || v === '' || v === undefined ? null : Number(v))

/** The fire days the rows know, the latest run's figures winning for a day. */
export function fireHistoryFrom(rows: HistoryRow[]): FireHistory {
  const best = new Map<string, { run: number; d: FireDay }>()
  for (const r of rows) {
    if (!r.item_id.startsWith('fire:') || !r.day) continue
    const key = `${r.item_id}|${r.day}`
    if ((best.get(key)?.run ?? -1) > r.run_id) continue
    best.set(key, {
      run: r.run_id,
      d: {
        day: r.day,
        events: num(r.events) ?? 0,
        districts: num(r.districts) ?? 0,
        ratio: num(r.ratio),
        counted: r.counted === true || r.counted === 'true',
      },
    })
  }
  const out: FireHistory = new Map()
  for (const [key, { d }] of best) {
    const id = key.split('|')[0]
    out.set(id, [...(out.get(id) ?? []), d])
  }
  for (const days of out.values()) days.sort((a, b) => a.day.localeCompare(b.day))
  return out
}

const DAY_MS = 86_400_000

/** b is the day after a. */
export function nextDay(a: string, b: string): boolean {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS) === 1
}

/** A real move between two days' counts: at least 15% and at least three clusters; less is holding. */
export function stepDirection(before: number, after: number): 'up' | 'down' | 'hold' {
  if (after >= before * 1.15 && after - before >= 3) return 'up'
  if (after <= before * 0.85 && before - after >= 3) return 'down'
  return 'hold'
}

/** How many days in a row, ending at index `end`, moved the same way. */
export function runEndingAt(days: FireDay[], end: number, dir: 'up' | 'down'): number {
  let n = 0
  for (let i = end; i >= 1; i--) {
    if (!nextDay(days[i - 1].day, days[i].day) || stepDirection(days[i - 1].events, days[i].events) !== dir) break
    n++
  }
  return n
}
