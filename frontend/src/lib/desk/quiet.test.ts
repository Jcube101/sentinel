import { describe, expect, it } from 'vitest'
import { allClearRows, closedSubject, copyContext, quietHeadline, quietStandfirst, watchCopy } from './copy'
import { deskEntries, snapshotEntry } from './entries'
import { closedSummaries, daysSinceLevel3, quietStreak, stripDays } from './quiet'
import type { DeskHistory, EditionData, WatchRow } from './types'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'
import h25 from './__fixtures__/history-25.json'

// Real history up to edition 25 (read-only requests, the same selects as
// useDeskHistory). No edition so far has been quiet, so the quiet copy is
// checked on edition 19 with everything above Level 1 taken out.
const ed25 = e25 as unknown as EditionData
const ed19 = e19 as unknown as EditionData
const history = h25 as unknown as DeskHistory

describe('the 14-day strip (edition 25)', () => {
  const days = stripDays(history, ed25.run)

  it('takes the highest level per IST day, from runs up to the edition only', () => {
    expect(days.map((d) => `${d.day.slice(8)}:${d.level ?? '-'}`)).toEqual([
      '15:-', '16:-', '17:-', '18:-', '19:-', // before the first edition
      '20:0', // No. 1, before the desk existed
      '21:2', '22:2',
      '23:4', '24:4', // the M7.0 quake, from No. 9
      '25:2',
      '26:4', '27:4', '28:4', // Cyclone Arnab, from No. 20
    ])
    expect(days.at(-1)!.today).toBe(true)
  })

  it('is not quiet: today has a Level 4', () => {
    expect(quietStreak(days)).toBe(0)
    expect(daysSinceLevel3(history.lastLevel3, ed25.run)).toBe(0)
  })

  it('counts quiet days back from today, and a day without an edition ends the run', () => {
    const quiet = days.map((d) => ({ ...d, level: d.level === null ? null : (Math.min(d.level, 1) as 0 | 1) }))
    expect(quietStreak(quiet)).toBe(9) // 20 to 28 Oct; 19 Oct had no edition
  })
})

describe('recently closed (edition 25)', () => {
  it('when each closed, its peak, and its days on the list from its latest opening', () => {
    expect(
      closedSummaries(history).map((c) => `${c.snapshot.item_id} ${c.closedOn.slice(5)} L${c.peak} ${c.daysOpen}d`),
    ).toEqual([
      'fire:gujarat 10-27 L2 2d',
      'earthquake:USGS-us6000u4p1 10-27 L1 2d',
      'earthquake:USGS-us6000u4f5 10-26 L1 2d',
      'earthquake:USGS-us6000u43g 10-24 L4 1d',
      'fire:madhya-pradesh 10-24 L2 3d',
    ])
  })

  it('names them plainly', () => {
    expect(closedSubject(snapshotEntry(history.closed[0]))).toBe("Gujarat's fires")
    expect(closedSubject(snapshotEntry(history.closed[3]))).toBe('Magnitude 7.0 earthquake, 350 km outside India')
  })
})

describe('the quiet desk copy (edition 19, Level 2+ taken out)', () => {
  const snapshots = ed19.snapshots.filter((s) => s.status === 'closed' || s.severity_level <= 1)
  const entries = deskEntries(snapshots, new Map())

  it('headline counts the quiet days in a row', () => {
    expect(quietHeadline(1)).toBe('A quiet day across India, with nothing above minor.')
    expect(quietHeadline(3)).toBe('A quiet day across India, the third in a row, with nothing above minor.')
    expect(quietHeadline(14)).toBe('A quiet fortnight across India, with nothing above minor for two weeks.')
  })

  it('standfirst: every category in a sentence; watching only on the latest edition', () => {
    expect(quietStandfirst(entries, null)).toBe(
      "No floods or cyclones are open. No state's fires are well above normal, the largest earthquake was magnitude 4.3 " +
        'and the worst air is poor, in six cities.',
    )
    expect(quietStandfirst(entries, 1)).toMatch(/One thing is worth watching\.$/)
  })

  it('all clear: one row per category, with the source and what was not updated', () => {
    expect(allClearRows(entries, ed19.status).map((r) => `${r.name} [${r.level ?? '-'} ${r.source}] ${r.line}`)).toEqual([
      "Cyclones [- GDACS] None open. Not updated: the global disaster monitors didn't answer this time.",
      "Floods [- GDACS] None open. Not updated: the global disaster monitors didn't answer this time.",
      'Earthquakes [1 USGS] Magnitude 4.3, 71 km from Rikaze, China.',
      'Air [1 CPCB] Poor in six cities, worst in Khairthal at 282.',
      "Fire [- FIRMS] No state's fires are well above normal for the time of year. Not updated: NASA's fire satellites didn't answer this time.",
    ])
  })
})

describe('watching (latest edition only)', () => {
  const no26 = { started_at: '2026-10-28T09:00:07Z' } // Wed 28 Oct, 14:30 IST
  const ctx = copyContext([], null, no26)
  const base = { item_id: null, trend: null, rising_updates: 0, watching: true, last_run_id: 26 }

  it('air near very poor, from the live row', () => {
    const row = {
      ...base,
      id: 'air:IN',
      category: 'air',
      title: 'Air quality (India)',
      level: 1,
      next_level: 2,
      metric: 'CPCB AQI in Panipat, the worst city; Very poor starts above 300',
      value: 293,
      next_threshold: 300,
      distance_to_threshold: 0.0233,
      watch_reason: '2% below the Level 2 threshold (300)',
    } as WatchRow
    expect(watchCopy(row, ctx)).toMatchObject({
      title: "Panipat's air is close to very poor",
      standfirst: 'Its air quality index is 293; very poor starts above 300.',
    })
  })

  it('a fire state near Level 2, with its day relative to the edition', () => {
    const row = {
      ...base,
      id: 'fire:uttar-pradesh',
      category: 'fire',
      title: 'Uttar Pradesh',
      level: 1,
      next_level: 2,
      metric: 'fire events on 27 Oct; Level 2 needs 2× the norm (42/day) and at least 25',
      value: 73,
      next_threshold: 85,
      distance_to_threshold: 0.14,
      watch_reason: '14% below the Level 2 threshold (85)',
      rising_updates: 3,
    } as WatchRow
    expect(watchCopy(row, ctx)).toMatchObject({
      title: "Uttar Pradesh's fires have risen for three days toward Level 2",
      standfirst: '73 fires yesterday, against 85 for Level 2.',
    })
  })
})
