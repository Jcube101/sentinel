import { describe, expect, it } from 'vitest'
import { deskEntries, type DeskEntry } from './entries'
import { asOfKicker, deskNotes, sourceCredit } from './notes'
import type { EditionData, Snapshot } from './types'
import e14 from './__fixtures__/edition-14.json'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'
import e26 from './__fixtures__/edition-26.json'

// The caveats live here, not in the stories (style guide, Facts in the story, caveats in notes).
const ed = (x: unknown) => x as EditionData
const byKey = (entries: DeskEntry[], key: string) => entries.find((e) => e.key === key)!

describe('the source line', () => {
  it('credits each item’s source, with how far to trust it', () => {
    const no26 = deskEntries(ed(e26).snapshots)
    const no14 = deskEntries(ed(e14).snapshots)
    expect([
      sourceCredit(byKey(no26, 'air:IN')),
      sourceCredit(byKey(no26, 'cyclone:GDACS-TC-1001345')),
      sourceCredit(byKey(no14, 'earthquake:USGS-us6000u43g')),
      sourceCredit(byKey(deskEntries(ed(e25).snapshots), 'fire:roundup')),
    ]).toEqual(['CPCB live data (unvalidated)', 'GDACS', 'USGS', 'NASA FIRMS satellites'])
  })

  it('says when a fire day is incomplete (No. 26: no data after 14:37 IST on 27 Oct)', () => {
    expect(sourceCredit(byKey(deskEntries(ed(e26).snapshots), 'fire:roundup'))).toBe(
      'NASA FIRMS satellites (27 Oct incomplete: no data after 14:37 IST)',
    )
  })

  it('names the estimate when air falls back to OpenAQ', () => {
    const openaq = ed(e26).snapshots.map((s): Snapshot =>
      s.category === 'air' ? { ...s, figures: { ...s.figures, source: 'openaq', approximate: true, unvalidated: false } } : s,
    )
    expect(sourceCredit(byKey(deskEntries(openaq), 'air:IN'))).toBe('Sentinel estimate from OpenAQ monitors')
  })

  it('says a source didn’t answer (No. 19: FIRMS timed out)', () => {
    expect(sourceCredit(byKey(deskEntries(ed(e19).snapshots), 'fire:roundup'))).toBe("NASA FIRMS satellites · didn't answer this time")
  })
})

describe('the "As of" kicker', () => {
  const no19 = ed(e19)
  const at = no19.run.started_at // Mon 26 Oct, 02:30 IST

  it('over a last-known item: when its figures date from, relative to the edition', () => {
    expect(asOfKicker(byKey(deskEntries(no19.snapshots), 'fire:roundup'), at)).toBe('As of Saturday')
    expect(asOfKicker(byKey(deskEntries(no19.snapshots), 'air:IN'), at)).toBeNull() // up to date
  })

  it('air readings from earlier the same day give the time; figures with no time say "Not updated"', () => {
    const stale = no19.snapshots.map((s): Snapshot =>
      s.category === 'air' ? { ...s, last_known: true, figures: { ...s.figures, data_as_of: '2026-10-26T00:00:00+05:30' } } : s,
    )
    expect(asOfKicker(byKey(deskEntries(stale), 'air:IN'), at)).toBe('As of 00:00 IST')
    const quake = no19.snapshots.map((s): Snapshot => (s.category === 'earthquake' ? { ...s, last_known: true } : s))
    expect(asOfKicker(byKey(deskEntries(quake), 'earthquake:USGS-us6000u4p1'), at)).toBe('Not updated')
  })
})

describe('the Notes', () => {
  it('explain the held fire level once, naming the states it holds (No. 25)', () => {
    expect(deskNotes(deskEntries(ed(e25).snapshots))).toEqual([
      {
        key: 'held',
        text:
          'Fire levels from satellite counts are held at Level 2 for now, until live counts have been checked against past years. ' +
          'A dashed square shows the level a state would otherwise have: Chhattisgarh and Telangana would be at Level 3.',
        squares: { level: 2, wouldBe: 3 },
      },
    ])
  })

  it('say a Severe reading needs a second report', () => {
    const severe = ed(e26).snapshots.map((s): Snapshot =>
      s.category === 'air' ? { ...s, figures: { ...s.figures, severe_unconfirmed: ['Delhi'] } } : s,
    )
    expect(deskNotes(deskEntries(severe)).map((n) => n.text)).toEqual([
      'Delhi read severe in the latest report. A city counts as severe only after two reports in a row.',
    ])
  })

  it('are empty when nothing needs saying (No. 26)', () => {
    expect(deskNotes(deskEntries(ed(e26).snapshots))).toEqual([])
  })
})
