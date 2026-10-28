import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext } from './copy'
import { deskEntries } from './entries'
import { fireDays, itemHistory, levelBars, openSince } from './item'
import { closedMapItems, fireDayOf, mapItems } from './mapdata'
import type { ChangeWindow, EditionData, TimedSnapshot } from './types'
import e14 from './__fixtures__/edition-14.json'
import e17 from './__fixtures__/edition-17.json'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'
import e26 from './__fixtures__/edition-26.json'
import w26 from './__fixtures__/window-26.json'

const editions = [e14, e17, e19, e25, e26] as unknown as EditionData[]

/** One item's snapshots across the fixture editions, with each run's start time, as useItem returns them. */
function snapsOf(id: string): TimedSnapshot[] {
  return editions.flatMap((ed) =>
    ed.snapshots.filter((s) => s.item_id === id).map((s) => ({ ...s, pipeline_runs: { started_at: ed.run.started_at } })),
  )
}

describe('item history (Madhya Pradesh fires, editions 14 to 26)', () => {
  const snaps = snapsOf('fire:madhya-pradesh')

  it('lists every change, the last-known runs and the latest, newest first, each with a plain note', () => {
    expect(itemHistory(snaps).map((h) => `${h.runId} ${h.kind} L${h.level}: ${h.note}`)).toEqual([
      '26 latest L2: 145 fires on 27 Oct, about twice the usual',
      '19 last_known L2: 185 fires on 24 Oct, about three times usual',
      '17 reopened L2: 185 fires on 24 Oct, about three times usual',
      "14 closed L1: Madhya Pradesh's fires have stayed down for two days",
    ])
  })

  it('a level bar per run, and when it last opened', () => {
    expect(levelBars(snaps).map((b) => `${b.runId}:${b.level}${b.closed ? 'c' : ''}${b.lastKnown ? 'k' : ''}`)).toEqual([
      '14:1c', '17:2', '19:2k', '25:2', '26:2',
    ])
    expect(openSince(snaps)).toBe(e17.run.started_at)
  })

  it('fires per day: daily counts before the shown day, the shown day as that edition counted it', () => {
    const shown = snaps.at(-1)!
    const daily = [
      { acq_date: '2026-10-25', fire_events: 323 },
      { acq_date: '2026-10-26', fire_events: 200 },
      { acq_date: '2026-10-27', fire_events: 150 }, // rebuilt later: the edition counted 145
    ]
    expect(fireDays(shown, daily, snaps)).toEqual([
      { day: '2026-10-23', fires: 109 }, // from No. 14's closing snapshot
      { day: '2026-10-24', fires: 185 }, // from the snapshots of No. 17 and 19
      { day: '2026-10-25', fires: 323 },
      { day: '2026-10-26', fires: 200 },
      { day: '2026-10-27', fires: 145 },
    ])
  })
})

describe('map markers (edition 26)', () => {
  const ed = e26 as unknown as EditionData
  const since = sinceYesterday(ed.snapshots, w26 as unknown as ChangeWindow)
  const entries = deskEntries(ed.snapshots, since.byItem)
  const ctx = copyContext(entries, since, ed.run)

  it('places items with a position as of the edition, numbered by desk row; air and a state with no fires stay off', () => {
    expect(mapItems(entries, ctx).map((m) => `${m.number} ${m.key} ${m.lat},${m.lon}`)).toEqual([
      '1 cyclone:GDACS-TC-1001345 16.2,81.6',
      '2 fire:madhya-pradesh 24.0578,77.788',
      '2 fire:maharashtra 19.0576,75.5137',
      '2 fire:uttar-pradesh 27.1675,80.9996',
      '2 fire:telangana 16.5812,77.5137',
    ])
  })

  it('a past edition gets no positions that later runs have moved (plan P1)', () => {
    const old = e25 as unknown as EditionData
    const oldEntries = deskEntries(old.snapshots, new Map())
    expect(mapItems(oldEntries, copyContext(oldEntries, null, old.run))).toEqual([])
  })

  it('closed items become hollow markers; the fire layer shows the day the edition levelled on', () => {
    expect(closedMapItems([]).length).toBe(0)
    expect(fireDayOf(ed.snapshots, ed.run)).toBe('2026-10-27')
    expect(fireDayOf([], { started_at: '2026-10-28T09:00:00Z' })).toBe('2026-10-27')
  })
})
