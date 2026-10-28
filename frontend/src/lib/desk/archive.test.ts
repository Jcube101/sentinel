import { describe, expect, it } from 'vitest'
import { archiveLead, chooseDayEdition, dayMaxLevels, monthDays, parseDay, runsByDay, shiftMonth, slotOf } from './archive'
import type { DeskHistory, EditionData, RunRef, SnapshotTrace } from './types'
import h25 from './__fixtures__/history-25.json'
import e26 from './__fixtures__/edition-26.json'
import w26 from './__fixtures__/window-26.json'

// Runs 1-25 from the history fixture, plus No. 26 (Wed 28 Oct, 14:30 IST).
const history = h25 as unknown as DeskHistory
const ed26 = e26 as unknown as EditionData
const runs: RunRef[] = [...history.runs, { id: 26, started_at: ed26.run.started_at, status: 'ok' }]

describe('which edition stands for a day', () => {
  const byDay = runsByDay(runs)
  const pick = (day: string) => {
    const c = chooseDayEdition(byDay.get(day) ?? [])
    return c ? `No. ${c.run.id}${c.evening ? '' : ' (no 20:30)'}` : 'none'
  }

  it('the first edition from 20:30 IST on; else the day’s latest, flagged', () => {
    expect(['2026-10-20', '2026-10-21', '2026-10-23', '2026-10-27', '2026-10-28', '2026-10-19'].map(pick)).toEqual([
      'No. 1', // 23:20 IST, before the desk began
      'No. 4',
      'No. 12', // after the manual runs No. 9 and 10
      'No. 24',
      'No. 26 (no 20:30)', // 02:30 and 14:30 only, so far
      'none',
    ])
    expect(byDay.get('2026-10-23')!.map((r) => `${r.id} ${slotOf(r.started_at)}`)).toEqual([
      '8 02:30',
      '9 11:16',
      '10 11:30',
      '11 14:30',
      '12 20:30',
    ])
  })

  it('the day’s highest level over all its editions, from runs up to the edition only', () => {
    // The strip fixture was saved with status=open as a filter, so its rows carry no status.
    const levels = dayMaxLevels(history.runs, history.strip.map((t) => ({ ...t, status: 'open' as const })))
    expect(Object.fromEntries([...levels].map(([d, l]) => [d.slice(8), l]))).toEqual({
      '20': 0, '21': 2, '22': 2, '23': 4, '24': 4, '25': 2, '26': 4, '27': 4, '28': 4,
    })
  })
})

describe('a day’s lead, as the Desk printed it', () => {
  it('No. 26: ranked and worded by the same code as the Desk, from the edition and the slim rows', () => {
    const open = ed26.snapshots.filter((s) => s.status === 'open')
    expect(archiveLead(ed26.run, open, runs, (w26 as unknown as { rows: SnapshotTrace[] }).rows)).toEqual({
      level: 4,
      title: 'Cyclone Arnab',
      beforeDesk: false,
    })
  })

  it('No. 1 ran before the desk', () => {
    expect(archiveLead({ id: 1, started_at: runs[0].started_at }, [], runs, []).beforeDesk).toBe(true)
  })
})

describe('days and months', () => {
  it('lists a month’s days newest first, within the archive’s span', () => {
    expect(monthDays('2026-10', '2026-10-20', '2026-10-28')).toEqual([
      '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22', '2026-10-21', '2026-10-20',
    ])
    expect([shiftMonth('2026-10', -1), shiftMonth('2026-12', 1)]).toEqual(['2026-09', '2027-01'])
  })

  it('accepts real days only', () => {
    expect([parseDay('2026-10-28'), parseDay('2026-02-30'), parseDay('28-10-2026'), parseDay(undefined)]).toEqual(['2026-10-28', null, null, null])
  })
})
