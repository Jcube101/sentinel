import { describe, expect, it } from 'vitest'
import { compareEntries, deskEntries, editionTitle } from './entries'
import { istDate, istTime, shortAge } from './ist'
import { splitReason } from './levels'
import { lateNotice, sourceLines } from './sources'
import type { EditionData } from './types'
import e14 from './__fixtures__/edition-14.json'
import e17 from './__fixtures__/edition-17.json'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'

// Real editions, saved with read-only anon-key requests (same selects as useEdition).
//  14: an M7.0 quake (Level 4) and an M4.6 (Level 1); GDACS timed out
//  17: two Level 1 quakes; fire items opened, reopened and capped
//  19: a failed run (FIRMS and GDACS timed out); fire items last-known
//  25: the latest edition when step 1 was written
const editions = { 14: e14, 17: e17, 19: e19, 25: e25 } as unknown as Record<number, EditionData>

describe('editionTitle', () => {
  it('matches the current title for the latest edition', () => {
    for (const s of editions[25].snapshots) expect(editionTitle(s)).toBe(s.desk_items?.title)
  })

  it("rebuilds each edition's titles: the top item per category matches that run's category_status summary", () => {
    for (const ed of Object.values(editions)) {
      for (const status of ed.status) {
        if (status.open_items === 0) continue
        const open = ed.snapshots.filter((s) => s.status === 'open' && s.category === status.category)
        // Rank the category the way watch.py does, with grouped quakes taken apart again.
        const ranked = deskEntries(open)
          .flatMap((e) => (e.members.length ? e.members : [e]))
          .sort(compareEntries)
        const summary = status.summary.split(' · ')[0].replace(/ \(\+\d+ more\)$/, '')
        expect(ranked[0].title, `edition ${ed.run.id} ${status.category}`).toBe(summary)
      }
    }
  })

  it('differs from the current title where the item changed since (edition 17)', () => {
    const gujarat = editions[17].snapshots.find((s) => s.item_id === 'fire:gujarat')!
    expect(editionTitle(gujarat)).toBe('Fire activity in 14 Gujarat districts')
    expect(gujarat.desk_items?.title).toBe('Fire activity in 3 Gujarat districts')
  })
})

describe('deskEntries', () => {
  it('ranks by level, then category, then ratio to norm, never by count (edition 25)', () => {
    expect(deskEntries(editions[25].snapshots).map((e) => e.key)).toEqual([
      'cyclone:GDACS-TC-1001345',
      'air:IN', // same level as the fires: cyclone, flood, earthquake, air, fire
      'fire:chhattisgarh', // 9.07×
      'fire:telangana', // 6.11×
      'fire:maharashtra', // 3.86×
      'fire:madhya-pradesh', // 2.91×, though it has the most fires
      'fire:uttar-pradesh', // 2.74×
    ])
  })

  it('groups two or more Level 1 quakes into one row (edition 17)', () => {
    const entries = deskEntries(editions[17].snapshots)
    const quakes = entries.filter((e) => e.category === 'earthquake')
    expect(quakes).toHaveLength(1)
    expect(quakes[0].members.map((m) => m.key)).toEqual(['earthquake:USGS-us6000u4f5', 'earthquake:USGS-us6000u4p1'])
    expect(quakes[0].title).toBe('2 small earthquakes, the largest M4.6, 91 km ESE of Tuensang, India')
    expect(quakes[0].reason).toBe('None reached magnitude 5 (USGS)')
    expect(quakes[0].newMembers).toBe(1)
  })

  it('keeps a lone Level 1 quake as its own row, below a Level 4 one (edition 14)', () => {
    const entries = deskEntries(editions[14].snapshots)
    expect(entries.map((e) => e.key)).toEqual([
      'earthquake:USGS-us6000u43g',
      'air:IN',
      'earthquake:USGS-us6000u4f5',
    ])
  })

  it('leaves closed items off the list (edition 14: Madhya Pradesh fire closed)', () => {
    expect(deskEntries(editions[14].snapshots).some((e) => e.key === 'fire:madhya-pradesh')).toBe(false)
  })

  it('labels the fire cap and drops it from the shown reason (edition 25, Chhattisgarh)', () => {
    const e = deskEntries(editions[25].snapshots).find((x) => x.key === 'fire:chhattisgarh')!
    expect(e.level).toBe(2)
    expect(e.wouldBe).toBe(3)
    expect(e.labels).toEqual([{ kind: 'cap', text: 'Held at Level 2 · would be 3' }])
    expect(e.reason).toBe('27 fire events on 26 Oct, 9.07× the seasonal norm (3.0/day)')
  })

  it('labels air from data.gov.in as provisional (unvalidated)', () => {
    const air = deskEntries(editions[25].snapshots).find((x) => x.key === 'air:IN')!
    expect(air.labels).toEqual([{ kind: 'unvalidated', text: 'Provisional' }])
  })

  it('marks last-known items with the reason the pipeline gave (edition 19)', () => {
    const e = deskEntries(editions[19].snapshots).find((x) => x.key === 'fire:telangana')!
    expect(e.lastKnown).toBe(true)
    expect(e.lastKnownWhy).toBe('FIRMS fetch failed this run')
    expect(e.wouldBe).toBe(3)
    expect(e.reason).toBe('34 fire events on 24 Oct, 5.33× the seasonal norm (6.4/day)')
  })
})

describe('splitReason', () => {
  it('splits the base rule from the cap and last-known notes', () => {
    expect(
      splitReason(
        '46 fire events on 24 Oct, 8.19× the seasonal norm (5.6/day) · capped at Level 2 pending calibration (would be Level 3) · last known: FIRMS fetch failed this run',
      ),
    ).toEqual({
      base: '46 fire events on 24 Oct, 8.19× the seasonal norm (5.6/day)',
      notes: [
        { kind: 'cap', text: 'capped at Level 2 pending calibration (would be Level 3)' },
        { kind: 'last_known', text: 'FIRMS fetch failed this run' },
      ],
    })
  })

  it('keeps air reasons with nested brackets whole', () => {
    const r = 'Very poor in Panipat (CPCB AQI, real-time (unvalidated); to 28 Oct, 02:00 IST)'
    expect(splitReason(r)).toEqual({ base: r, notes: [] })
  })
})

describe('sources', () => {
  it('flags the failed sources of edition 19 and calls quiet event sources quiet', () => {
    const lines = Object.fromEntries(sourceLines(editions[19].run).map((l) => [l.id, l]))
    expect(lines.FIRMS).toMatchObject({ failed: true, text: 'TIMED OUT', words: "didn't answer" })
    expect(lines.GDACS).toMatchObject({ failed: true, text: 'TIMED OUT' })
    expect(lines.USGS).toMatchObject({ failed: false, text: 'QUIET', words: 'no new events' })
    expect(lines.OPENAQ.failed).toBe(false)
  })

  it('writes the late notice for edition 19, and none for edition 25', () => {
    expect(lateNotice(editions[19].run, editions[19].status)).toBe(
      "NASA's fire satellites and the global disaster monitors didn't answer this time, so cyclone, flood and fire news is as last reported.",
    )
    expect(lateNotice(editions[25].run, editions[25].status)).toBeNull()
  })
})

describe('IST', () => {
  it('prints the 02:30 IST run on the IST date', () => {
    expect(istDate(editions[25].run.started_at)).toBe('Wed 28 Oct 2026')
    expect(istTime(editions[25].run.started_at)).toBe('02:30')
  })

  it('prints ages the way the footer does', () => {
    expect(shortAge(42 * 60_000)).toBe('42M')
    expect(shortAge((11 * 60 + 53) * 60_000)).toBe('11H 53M')
    expect(shortAge(3 * 24 * 3600_000)).toBe('3D')
  })
})
