import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext, headEvents, pageHeadline } from './copy'
import { deskEntries } from './entries'
import type { ChangeWindow, EditionData } from './types'
import e14 from './__fixtures__/edition-14.json'
import e83 from './__fixtures__/edition-83.json'
import w83 from './__fixtures__/window-83.json'

// A one-time verb says something happened in this edition, so it belongs to an item's first report only. A storm that
// appears has not "strengthened" (that claims an earlier, weaker state); a revised quake has not "struck" again.
const noWindow: ChangeWindow = { ref: null, rows: [], closed: [] }

type Snap = EditionData['snapshots'][number]

function events(data: EditionData, edit: (s: Snap) => Snap, window: ChangeWindow = noWindow) {
  const snaps = data.snapshots.map(edit)
  const since = sinceYesterday(snaps, window)
  const entries = deskEntries(snaps, since.byItem)
  const ctx = copyContext(entries, since, data.run)
  return { headline: pageHeadline(entries, ctx), events: headEvents(entries, ctx) }
}

const ed83 = e83 as unknown as EditionData
const ed14 = e14 as unknown as EditionData

describe('cyclone first edition', () => {
  it('edition 83: a storm that opens in this edition "forms"', () => {
    const since = sinceYesterday(ed83.snapshots, w83 as unknown as ChangeWindow)
    const entries = deskEntries(ed83.snapshots, since.byItem)
    const h = pageHeadline(entries, copyContext(entries, since, ed83.run))
    expect(h).toBe('Cyclone Akvan forms in the Bay of Bengal.')
    expect(h).not.toMatch(/strengthens/)
  })

  it('a storm already on the desk that escalates "strengthens"; a steady one "holds"', () => {
    expect(events(ed83, (s) => (s.category === 'cyclone' ? { ...s, change: 'escalated' } : s)).headline).toMatch(/^Cyclone Akvan strengthens/)
    expect(events(ed83, (s) => (s.category === 'cyclone' ? { ...s, change: null } : s)).headline).toMatch(/^Cyclone Akvan holds at orange alert/)
  })
})

describe('earthquake first edition', () => {
  const quake = (change: Snap['change']) => events(ed14, (s) => (s.category === 'earthquake' ? { ...s, change } : s))

  it('"strikes" only when the quake opens (or comes back) in this edition', () => {
    expect(quake('opened').events.find((e) => e.category === 'earthquake')!.text).toMatch(/earthquake strikes /)
  })

  it('a revised quake (escalated, de-escalated, or none) "struck"', () => {
    for (const change of ['escalated', 'deescalated', null] as const) {
      expect(quake(change).events.find((e) => e.category === 'earthquake')!.text).toMatch(/earthquake struck /)
    }
  })
})

describe('flood first edition', () => {
  // No real flood fixture: edition 83's cyclone snapshot becomes a flood in Assam.
  const flood = (change: Snap['change']) =>
    events(ed83, (s) =>
      s.category === 'cyclone'
        ? ({ ...s, category: 'flood', item_id: 'flood:GDACS-FL-1', change, title: 'Floods in Assam', place_name: 'Assam', desk_items: { ...(s as { desk_items?: object }).desk_items, title: 'Floods in Assam' } } as unknown as Snap)
        : s,
    ).events.find((e) => e.category === 'flood')!

  it('an opened flood is a first report (tier 2); a continuing one is not', () => {
    expect(flood('opened').tier).toBe(2)
    expect(flood(null).tier).toBe(1)
  })

  it('escalated says "worsens", de-escalated "eases", anything else "is on an alert"', () => {
    expect(flood('escalated').text).toMatch(/worsens$/)
    expect(flood('deescalated').text).toMatch(/eases$/)
    expect(flood('opened').text).toMatch(/is on an? (orange|red|green) alert$/)
  })
})
