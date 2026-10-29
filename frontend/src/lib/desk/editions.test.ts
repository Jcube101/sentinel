// What editions from 29 on store for themselves (plan P1-P4), and the fallbacks for older ones.
import { describe, expect, it } from 'vitest'
import { copyContext, itemCopy } from './copy'
import { deskEntries, snapshotEntry } from './entries'
import { dayPoints, fireLayerOf, mapItems, type DayPointsRow } from './mapdata'
import { deskNotes } from './notes'
import { SCALE, minFireEvents, scaleFrom, scaleRows } from './scale'
import { watchRows, type WatchSnapshot } from './watch'
import type { EditionData, Snapshot } from './types'
import configs from './__fixtures__/severity-configs.json'
import e26 from './__fixtures__/edition-26.json'

const ed = e26 as unknown as EditionData

describe('the scale each edition ran with (P3)', () => {
  it('reads edition 28 as the current rules', () => {
    expect(scaleFrom(configs['28'])).toEqual(SCALE)
  })

  it('falls back to the current rules without a stored scale', () => {
    expect(scaleFrom(null)).toBe(SCALE)
    expect(scaleFrom(undefined)).toBe(SCALE)
  })

  it('edition 5 ran before the AQI bands and the two-reports rule for severe', () => {
    const s = scaleFrom(configs['5'])
    expect(s.air.aqi).toBeNull()
    expect(s.air.severeConfirmRuns).toBeNull()
    expect(s.air.pm25).toEqual(SCALE.air.pm25)
    expect(s.fire.level2MinRatio).toBe(2)
  })

  it('edition 2 ran the first fire rules: 1.25 and 2 times usual, 10 fires, no cap', () => {
    const s = scaleFrom(configs['2'])
    expect(s.fire).toMatchObject({ level2MinRatio: 1.25, level3MinRatio: 2, minFireEvents: 10, calibrationCap: null })
    expect(scaleRows(s).find((r) => r.name === 'Fire')!.cells.slice(0, 3)).toEqual([
      'under 1.25 times usual',
      '1.25–2 times usual',
      '2+ times usual, or a forest-fire alert',
    ])
  })

  it('the levels table under the current rules', () => {
    expect(scaleRows(SCALE).map((r) => r.cells.join(' | '))).toEqual([
      'green alert | green, rising | orange | red',
      'under 5 | 5–5.9 | 6–6.9 | 7 and over',
      'poor | very poor | severe, 1 city | severe, 3+ cities',
      'under 2 times usual | 2–4 times usual | 4+ times usual, or a forest-fire alert | a large fire near a town',
    ])
  })

  it('an item’s own minimum count wins over the scale', () => {
    expect(minFireEvents({ min_fire_events: 10 }, SCALE)).toBe(10)
    expect(minFireEvents({}, scaleFrom(configs['2']))).toBe(10)
    expect(minFireEvents({}, SCALE)).toBe(25)
  })

  it('the copy context carries the edition’s scale, and the notes use it', () => {
    const entries = deskEntries(ed.snapshots, new Map())
    expect(copyContext(entries, null, ed.run).scale).toBe(SCALE)
    expect(copyContext(entries, null, { ...ed.run, severity_config: configs['2'] }).scale.fire.level2MinRatio).toBe(1.25)
    const air = entries.find((e) => e.category === 'air')!
    const unconfirmed = { ...air, figures: { ...air.figures, severe_unconfirmed: ['Delhi'] } }
    const three = { ...SCALE, air: { ...SCALE.air, severeConfirmRuns: 3 } }
    expect(deskNotes([unconfirmed], three)[0].text).toMatch(/only after three reports in a row\.$/)
  })
})

describe('title, place and position as of the run (P1)', () => {
  const cyclone = ed.snapshots.find((s) => s.category === 'cyclone')!

  it('older editions: desk_items’ title and place, and its position only if no later run moved it', () => {
    const e = snapshotEntry(cyclone)
    expect(e.title).toBe(cyclone.desk_items!.title)
    expect(e.placeName).toBe(cyclone.desk_items!.place_name)
    expect(e.coords).toEqual([Number(cyclone.desk_items!.latitude), Number(cyclone.desk_items!.longitude)])
    const moved = { ...cyclone, desk_items: { ...cyclone.desk_items!, last_run_id: cyclone.run_id + 1 } }
    expect(snapshotEntry(moved).coords).toBeNull()
  })

  it('from edition 29: the snapshot’s own, even when a later run moved the item', () => {
    const own: Snapshot = {
      ...cyclone,
      title: 'Cyclone Arnab (as of the run)',
      place_name: 'Bay of Bengal',
      latitude: 15.2,
      longitude: 84.1,
      desk_items: { ...cyclone.desk_items!, title: 'Cyclone Arnab (now)', place_name: 'India', latitude: 1, longitude: 2, last_run_id: cyclone.run_id + 3 },
    }
    const e = snapshotEntry(own)
    expect(e.title).toBe('Cyclone Arnab (as of the run)')
    expect(e.placeName).toBe('Bay of Bengal')
    expect(e.coords).toEqual([15.2, 84.1])
  })

  it('from edition 29, an item with no position (air) has none, whatever desk_items says', () => {
    const air = ed.snapshots.find((s) => s.category === 'air')!
    const own = { ...air, title: 'Air quality: poor in 12 cities', place_name: null, latitude: null, longitude: null }
    expect(snapshotEntry({ ...own, desk_items: { ...air.desk_items!, latitude: 28.6, longitude: 77.2, last_run_id: air.run_id } }).coords).toBeNull()
  })
})

describe('the fire layer as each edition saw it (P4)', () => {
  const row: DayPointsRow = {
    acq_date: '2026-10-26',
    states: ['Punjab', 'Madhya Pradesh'],
    points: [
      [30.9, 75.8, 3, 12.5, 100, 0],
      [23.2, 77.4, 1, 4.0, 1313, 1],
      [23.3, 77.5, 2, 6.0, 1314, 1],
      [22.0, 80.0, 1, 3.0, 50, null],
    ],
  }

  it('keeps the fires first seen by the edition’s FIRMS data time, in India', () => {
    const kept = dayPoints(row, '2026-10-26T21:53:00+00:00')
    expect(kept.map((p) => [p.state, p.hotspot_count])).toEqual([
      ['Punjab', 3],
      ['Madhya Pradesh', 1],
    ])
    expect(kept[0]).toEqual({ latitude: 30.9, longitude: 75.8, hotspot_count: 3, frp_max: 12.5, district: null, state: 'Punjab' })
  })

  it('a data time on a later day, or none, keeps the whole day', () => {
    expect(dayPoints(row, '2026-10-27T05:00:00Z').length).toBe(3)
    expect(dayPoints(row, null).length).toBe(3)
  })

  it('the layer is the fire items’ day and data time', () => {
    const fire = ed.snapshots.find((s) => s.category === 'fire')!
    const snaps = [{ ...fire, figures: { ...fire.figures, data_to: '2026-10-27T21:40:00+00:00' } }]
    expect(fireLayerOf(snaps, ed.run)).toEqual({ day: fire.figures.day, to: '2026-10-27T21:40:00+00:00' })
    expect(fireLayerOf([], { started_at: '2026-10-28T09:00:00Z' })).toEqual({ day: '2026-10-27', to: null })
  })

  it('a Level 4 state rings its large fires near towns by their stored positions', () => {
    const fire = ed.snapshots.find((s) => s.category === 'fire')!
    const l4: Snapshot = {
      ...fire,
      severity_level: 4,
      latitude: 23.0,
      longitude: 77.0,
      title: 'Fire activity in 21 Madhya Pradesh districts',
      figures: { ...fire.figures, large_fires_near_people: [{ place: 'Bhopal', km: 6, latitude: 23.31, longitude: 77.35 }, { place: 'old row' }] },
    }
    const entries = deskEntries([l4], new Map())
    const [m] = mapItems(entries, copyContext(entries, null, ed.run))
    expect(m.ringed).toEqual([[23.31, 77.35]])
    expect(itemCopy(entries[0], copyContext(entries, null, ed.run)).standfirst).toMatch(/town of 1,00,000 people or more/)
  })
})

describe('the watching list as each edition kept it (P2)', () => {
  const base = { category: 'fire' as const, item_id: null, level: 1 as const, metric: 'fires on 27 Oct', rising_updates: 0, watch_reason: null }
  const row = (run_id: number, subject_id: string, value: number | null, at: string | null, more: Partial<WatchSnapshot> = {}): WatchSnapshot => ({
    ...base,
    run_id,
    subject_id,
    title: subject_id,
    value,
    next_level: 2,
    next_threshold: 25,
    distance_to_threshold: 25 - (value ?? 0),
    watching: true,
    source_updated_at: at,
    ...more,
  })

  it('only the subjects watching in this run, closest first, with their values at each source update as the trend', () => {
    const own = [row(31, 'fire:punjab', 22, 'D3'), row(31, 'fire:haryana', 24, 'D3'), row(31, 'fire:kerala', 1, 'D3', { watching: false })]
    const earlier = [
      row(29, 'fire:punjab', 18, 'D1'),
      row(30, 'fire:punjab', 18, 'D1'), // no new source update: no new trend point
      row(30, 'fire:haryana', null, 'D2'),
    ]
    const rows = watchRows(own, earlier)
    expect(rows.map((r) => r.id)).toEqual(['fire:haryana', 'fire:punjab'])
    expect(rows[1].trend!.map((p) => p.value)).toEqual([18, 22])
    expect(rows[0].trend!.map((p) => p.value)).toEqual([24])
    expect(rows[1]).toMatchObject({ title: 'fire:punjab', level: 1, next_level: 2, value: 22, next_threshold: 25, watching: true, last_run_id: 31 })
  })

  it('keeps the last ten updates', () => {
    const earlier = Array.from({ length: 12 }, (_, i) => row(18 + i, 'fire:punjab', i, `D${i}`))
    const [r] = watchRows([row(31, 'fire:punjab', 20, 'D99')], earlier)
    expect(r.trend!.length).toBe(10)
    expect(r.trend!.at(-1)!.value).toBe(20)
  })
})
