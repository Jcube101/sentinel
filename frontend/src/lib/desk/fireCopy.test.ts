import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext, itemCopy, pageHeadline } from './copy'
import { deskEntries } from './entries'
import { fireHistoryFrom, stepDirection, type FireDay } from './fireHistory'
import type { ChangeWindow, EditionData } from './types'
import e25 from './__fixtures__/edition-25.json'

// The fire copy framework (docs/style-guide.md, Fire): place + direction + benchmark. Synthetic states built on
// edition 25's Telangana snapshot, so every line here is a rule, not a recording.
const ed = e25 as unknown as EditionData
const base = ed.snapshots.find((s) => s.item_id === 'fire:telangana')!

const FIRST_SLOT = '2026-10-27T09:00:00Z' // the 14:30 IST edition: the first of its fire day
const LATER_SLOT = '2026-10-27T15:00:00Z' // 20:30 IST: the same fire day again

interface Spec {
  state: string
  n: number
  districts?: number
  ratio?: number
  level?: 1 | 2 | 3
  max?: number
  /** Complete days before the edition's own, oldest first, ending on 25 Oct (the day before the fire day 26 Oct). */
  before?: { events: number; districts?: number; ratio?: number }[]
  change?: 'opened' | 'reopened' | 'escalated' | 'deescalated' | null
  alert?: string
}

const slug = (s: string) => `fire:${s.toLowerCase().replace(/ /g, '-')}`

function snapshot(sp: Spec) {
  return {
    ...base,
    item_id: slug(sp.state),
    severity_level: sp.level ?? 2,
    change: sp.change ?? null,
    figures: {
      ...base.figures,
      state: sp.state,
      day: '2026-10-26',
      fire_events: sp.n,
      district_count: sp.districts ?? 10,
      ratio_to_norm: sp.ratio ?? 2.1,
      ratio_counted: sp.n >= 40,
      norm_max_daily_events: sp.max ?? 500,
      norm_years: '2023-2025',
      min_fire_events: 40,
      large_fires_near_people: [],
      gdacs_wildfire: sp.alert ? [{ alert_level: sp.alert }] : [],
      gdacs_level: 0,
      ratio_level: sp.level ?? 2,
    },
  }
}

function history(specs: Spec[]) {
  const rows = specs.flatMap((sp) =>
    (sp.before ?? []).map((d, i, all) => {
      const day = new Date(Date.UTC(2026, 9, 25 - (all.length - 1 - i)))
      return {
        run_id: 1 + i,
        item_id: slug(sp.state),
        day: day.toISOString().slice(0, 10),
        events: d.events,
        districts: d.districts ?? 10,
        ratio: d.ratio ?? 2.1,
        counted: d.events >= 40,
      }
    }),
  )
  return fireHistoryFrom(rows)
}

function run(specs: Spec[], at = FIRST_SLOT, withHistory = true) {
  const snaps = [...ed.snapshots.filter((s) => s.category !== 'fire'), ...specs.map(snapshot)] as EditionData['snapshots']
  const noWindow: ChangeWindow = { ref: null, rows: [], closed: [] }
  const since = sinceYesterday(snaps, noWindow)
  const entries = deskEntries(snaps, since.byItem)
  const ctx = copyContext(entries, since, { ...ed.run, started_at: at }, withHistory ? history(specs) : undefined)
  const fires = entries.filter((e) => e.category === 'fire').map((e) => itemCopy(e, ctx))
  // The headline with the other categories out of the way: only the fire clause.
  const fireOnly = deskEntries(snaps.filter((s) => s.category === 'fire'), since.byItem)
  return { fires, entries, headline: pageHeadline(fireOnly, copyContext(fireOnly, since, { ...ed.run, started_at: at }, withHistory ? history(specs) : undefined)) }
}

const rising = [{ events: 20 }, { events: 30 }, { events: 45 }].map((d) => ({ ...d, ratio: 2.2 }))

describe('fire titles: place + direction + benchmark', () => {
  it('rising: direction leads, run length when true, the benchmark after a comma', () => {
    const { fires, headline } = run([{ state: 'Gujarat', n: 60, ratio: 2.0, before: rising }])
    expect(fires[0].title).toBe('Fires climb in Gujarat for a third day, double the usual for late October')
    expect(headline).toBe('Fires climb in Gujarat for a third day, double the usual for late October.')
  })

  it('record: only when it is one, with the years the norm covers', () => {
    const { fires } = run([{ state: 'Gujarat', n: 60, ratio: 2.0, max: 55, before: rising }])
    expect(fires[0].title).toBe('Gujarat sees its busiest late-October fire day in three years')
  })

  it('spreading: a district count, only when spreading is the story', () => {
    const { fires } = run([{ state: 'Maharashtra', n: 50, districts: 14, ratio: 2.3, before: [{ events: 49, districts: 8, ratio: 2.2 }] }])
    expect(fires[0].title).toBe('Fires spread to 14 districts in Maharashtra')
  })

  it('easing but held: the dip after a surge, still above usual', () => {
    const { fires } = run([
      { state: 'Telangana', n: 40, ratio: 1.6, before: [15, 20, 35, 55].map((events) => ({ events, ratio: 2.4 })) },
    ])
    expect(fires[0].title).toBe('Telangana fires dip after three-day surge, still above usual')
    expect(fires[0].standfirst).toMatch(/^Satellites picked up fires in 10 Telangana districts yesterday\. That's still about one and a half times what late October usually sees\.$/)
  })

  it('back to seasonal levels: said once, in the edition whose run recorded it', () => {
    const { fires } = run([{ state: 'Telangana', n: 12, ratio: 1.1, level: 1, change: 'deescalated', before: [{ events: 50 }] }])
    expect(fires[0].title).toBe('Fires in Telangana ease back to seasonal levels')
  })

  it('several states: the region, the direction, the benchmark for the strongest', () => {
    const w = { before: [{ events: 38 }], ratio: 2.1 }
    const { fires, headline } = run([
      { state: 'Gujarat', n: 60, ...w },
      { state: 'Maharashtra', n: 55, ...w },
      { state: 'Goa', n: 45, ratio: 2.0, before: [{ events: 38 }] },
    ])
    expect(fires[0].title).toBe('Fires climb across western India, double the usual in Gujarat and Maharashtra')
    expect(headline).toBe('Fires climb across western India, double the usual in Gujarat and Maharashtra.')
  })

  it('persisting: where the state stands, with the run, not the one-time verb', () => {
    const days = [{ events: 50 }, { events: 52 }, { events: 55 }].map((d) => ({ ...d, ratio: 2.2 }))
    const { fires } = run([{ state: 'Gujarat', n: 55, ratio: 2.2, before: days }])
    expect(fires[0].title).toBe('Fires stay above usual in Gujarat for a fourth day')
  })

  it('a climb is said once: the later editions of the same fire day say where the state stands', () => {
    const spec: Spec = { state: 'Gujarat', n: 60, ratio: 2.0, before: rising }
    expect(run([spec], FIRST_SLOT).fires[0].title).toMatch(/^Fires climb in Gujarat/)
    expect(run([spec], LATER_SLOT).fires[0].title).toBe('Fires stay above usual in Gujarat')
  })

  it('without the days before, it still says which way and the benchmark', () => {
    const { fires } = run([{ state: 'Gujarat', n: 60, ratio: 2.0, change: 'opened' }], FIRST_SLOT, false)
    expect(fires[0].title).toBe('Fires climb in Gujarat, double the usual for late October')
  })
})

describe('what is news', () => {
  it('a state busy within its usual range, with no move, is not in the headline', () => {
    const { headline, fires } = run([{ state: 'Madhya Pradesh', n: 90, ratio: 2.0, before: [{ events: 88 }] }])
    expect(headline).not.toMatch(/fire/i)
    expect(fires[0].title).toBe('Fires stay above usual in Madhya Pradesh') // a row on the desk, not a story
  })

  it('direction needs a real move: 15% and three clusters', () => {
    expect([stepDirection(100, 114), stepDirection(100, 115), stepDirection(100, 86), stepDirection(100, 85), stepDirection(10, 12)]).toEqual([
      'hold',
      'up',
      'hold',
      'down',
      'hold',
    ])
  })
})

describe('the words', () => {
  const specs: Spec[][] = [
    [{ state: 'Gujarat', n: 60, ratio: 2.04, before: rising }],
    [{ state: 'Gujarat', n: 60, ratio: 2.0, max: 55, before: rising }],
    [{ state: 'Telangana', n: 40, ratio: 1.76, before: [15, 20, 35, 55].map((events) => ({ events })) }],
    [{ state: 'Gujarat', n: 300, ratio: 9.07, level: 3, before: [{ events: 100 }] }],
  ]

  it('no decimals, no multiplication sign and no cluster counts in any title or standfirst', () => {
    for (const sp of specs) {
      const { fires, headline } = run(sp)
      for (const text of [headline, ...fires.flatMap((f) => [f.title, f.standfirst ?? ''])]) {
        expect(text).not.toMatch(/\d\.\d|×|\bx\b/)
      }
      for (const f of fires) expect(f.title).not.toMatch(/\b(60|40|300|55) fires\b|\bfires? events?\b/i)
    }
  })

  it('titles name only district counts, and never "farm" or "forest" without an Orange or Red alert', () => {
    for (const alert of ['Green', undefined]) {
      const { fires } = run([{ state: 'Gujarat', n: 60, ratio: 2.0, before: rising, alert }])
      for (const f of fires) expect(`${f.title} ${f.standfirst}`).not.toMatch(/farm|forest/i)
    }
    const red = run([{ state: 'Gujarat', n: 20, ratio: 1.2, level: 3, alert: 'Red' }]).fires[0]
    expect(red.title).toMatch(/forest fire/)
  })

  it('the standfirst gives districts against the day before, sourced once', () => {
    const { fires } = run([{ state: 'Telangana', n: 40, districts: 9, ratio: 1.6, before: [{ events: 55, districts: 15, ratio: 2.4 }] }])
    expect(fires[0].standfirst).toBe(
      "Satellites picked up fires in 9 Telangana districts yesterday, down from 15 on Sunday. That's still about one and a half times what late October usually sees.",
    )
  })
})

describe('fire history', () => {
  it('keeps the latest run for a day and sorts oldest first', () => {
    const rows = [
      { run_id: 3, item_id: 'fire:a', day: '2026-10-25', events: '50', districts: 5, ratio: '2.1', counted: 'true' },
      { run_id: 2, item_id: 'fire:a', day: '2026-10-25', events: 30, districts: 4, ratio: 1.5, counted: false },
      { run_id: 1, item_id: 'fire:a', day: '2026-10-24', events: 20, districts: 3, ratio: null, counted: false },
      { run_id: 1, item_id: 'air:IN', day: '2026-10-24', events: 1, districts: 1, ratio: null, counted: false },
    ]
    const h = fireHistoryFrom(rows)
    expect([...h.keys()]).toEqual(['fire:a'])
    expect(h.get('fire:a')!.map((d: FireDay) => [d.day, d.events, d.counted])).toEqual([
      ['2026-10-24', 20, false],
      ['2026-10-25', 50, true],
    ])
  })
})
