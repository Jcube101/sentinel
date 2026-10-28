import { describe, expect, it } from 'vitest'
import { sinceLabel, sinceYesterday } from './changes'
import { deskEntries, missingCategories } from './entries'
import { changeCounts } from './headline'
import { dayBefore, istDay } from './ist'
import type { ChangeWindow, EditionData } from './types'
import e14 from './__fixtures__/edition-14.json'
import e17 from './__fixtures__/edition-17.json'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'
import w14 from './__fixtures__/window-14.json'
import w17 from './__fixtures__/window-17.json'
import w19 from './__fixtures__/window-19.json'
import w25 from './__fixtures__/window-25.json'

// Real editions and their "since yesterday" windows, saved with read-only
// anon-key requests (the same selects as useEdition and useChangeWindow).
// Expected changes worked out by hand from the raw rows.
const editions = { 14: e14, 17: e17, 19: e19, 25: e25 } as unknown as Record<number, EditionData>
const windows = { 14: w14, 17: w17, 19: w19, 25: w25 } as unknown as Record<number, ChangeWindow>

function since(n: number) {
  return sinceYesterday(editions[n].snapshots, windows[n])
}

function moves(n: number) {
  return since(n).moves.map((m) => `${m.kind} ${m.itemId}${m.from !== null && m.to !== null ? ` ${m.from}→${m.to}` : ''}`)
}

describe('sinceYesterday', () => {
  it('edition 25 against 22: Chhattisgarh new, Gujarat closed; air down and back up is no change', () => {
    expect(windows[25].ref?.id).toBe(22)
    expect(moves(25)).toEqual(['new fire:chhattisgarh', 'closed fire:gujarat'])
    // The run's own change says escalated (1 → 2 in this run), but a day earlier it was Level 2 too.
    const air = deskEntries(editions[25].snapshots, since(25).byItem).find((e) => e.key === 'air:IN')!
    expect(air.change).toBeNull()
  })

  it('edition 17 against 14: new, reopened, eased and closed, most severe first', () => {
    expect(moves(17)).toEqual([
      'new fire:gujarat', // 8.19×
      'new fire:telangana', // 5.33×
      'new earthquake:USGS-us6000u4p1',
      'reopened fire:maharashtra', // 3.86×
      'reopened fire:madhya-pradesh', // 2.69×
      'deescalated air:IN 2→1',
      'closed earthquake:USGS-us6000u43g', // the M7.0, closed in No. 15
    ])
    // The M4.6 opened in No. 14 itself: already on yesterday's desk, so not new.
    expect(since(17).byItem.has('earthquake:USGS-us6000u4f5')).toBe(false)
  })

  it('edition 14 against 11: air escalated 1 → 2, a new quake, a fire closed in this run', () => {
    expect(moves(14)).toEqual(['new earthquake:USGS-us6000u4f5', 'escalated air:IN 1→2', 'closed fire:madhya-pradesh'])
  })

  it("ignores an item that closed in the reference run itself (edition 25: the quake closed in No. 22)", () => {
    expect(since(25).byItem.has('earthquake:USGS-us6000u4p1')).toBe(false)
  })

  it('counts new and reopened together', () => {
    expect(changeCounts(since(17))).toBe('5 new · 1 down · 1 closed')
    expect(changeCounts(since(25))).toBe('1 new · 1 closed')
  })

  it('treats everything open as new when there is no edition a day earlier', () => {
    const s = sinceYesterday(editions[25].snapshots, { ref: null, rows: [], closed: [] })
    expect(s.counts.new).toBe(0) // none of them opened in No. 25 itself
    expect(sinceLabel(null, editions[25].run)).toBe('Since the desk started')
  })

  it('labels the window with the reference run', () => {
    expect(sinceLabel(windows[25].ref, editions[25].run)).toBe('Since yesterday 02:30')
    expect(sinceLabel({ id: 1, started_at: '2026-10-25T09:00:00Z' }, editions[25].run)).toBe('Since 25 Oct 14:30')
  })
})

describe('deskEntries with the day’s changes', () => {
  it('tags items with their change since yesterday, not just this run’s', () => {
    const entries = deskEntries(editions[25].snapshots, since(25).byItem).flatMap((e) => [e, ...e.members])
    expect(entries.find((e) => e.key === 'fire:chhattisgarh')?.change).toBe('opened') // opened in No. 23
    const air = deskEntries(editions[17].snapshots, since(17).byItem).find((e) => e.key === 'air:IN')!
    expect([air.change, air.from]).toEqual(['deescalated', 2])
  })

  it('counts new members of the Level 1 quake group', () => {
    const group = deskEntries(editions[17].snapshots, since(17).byItem).find((e) => e.category === 'earthquake')!
    expect(group.newMembers).toBe(1)
    const fires = deskEntries(editions[17].snapshots, since(17).byItem).find((e) => e.category === 'fire')!
    expect(fires.newMembers).toBe(4) // two new, two back
  })

  it('shows a carried-over item as last-known, from the edition it came from', () => {
    const s = { ...editions[25].snapshots.find((x) => x.item_id === 'fire:telangana')!, carried_from: 24 }
    const [e] = deskEntries([s], new Map())
    expect(e.lastKnown).toBe(true)
    expect(e.lastKnownWhy).toBe("the fire check failed; figures from No. 24")
    expect(e.carriedFrom).toBe(24)
  })
})

describe('missingCategories', () => {
  it('finds none in real editions', () => {
    for (const ed of Object.values(editions)) expect(missingCategories(ed.snapshots, ed.status)).toEqual([])
  })

  it('finds a category whose snapshots are missing (a crashed stage)', () => {
    const ed = editions[25]
    const without = ed.snapshots.filter((s) => s.category !== 'fire')
    expect(missingCategories(without, ed.status)).toEqual(['fire'])
  })
})

describe('IST days', () => {
  it('keys a run by its IST calendar day, across months and years', () => {
    expect(istDay('2026-10-27T21:00:07+00:00')).toBe('2026-10-28') // the 02:30 IST run
    expect(istDay('2026-09-03T10:00:00Z')).toBe('2026-09-03') // en-GB writes "Sept"; the key doesn't
    expect(istDay('2026-12-31T18:31:00Z')).toBe('2027-01-01')
    expect(dayBefore('2026-03-01')).toBe('2026-02-28')
  })
})
