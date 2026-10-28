import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext, cycloneName, itemCopy, pageHeadline, quakeMemberLine, sinceLines } from './copy'
import { deskEntries } from './entries'
import type { ChangeWindow, EditionData } from './types'
import {
  aboutCount,
  inYears,
  partOfMonth,
  relativeDay,
  roundKm,
  timesNormal,
  timesUsual,
  whereStates,
} from './words'
import e14 from './__fixtures__/edition-14.json'
import e17 from './__fixtures__/edition-17.json'
import e19 from './__fixtures__/edition-19.json'
import e25 from './__fixtures__/edition-25.json'
import w14 from './__fixtures__/window-14.json'
import w17 from './__fixtures__/window-17.json'
import w19 from './__fixtures__/window-19.json'
import w25 from './__fixtures__/window-25.json'

// The copy for real editions, held to the letter (docs/style-guide.md). Every
// line comes from the edition's own data, so these are also the archive's words.
const fixtures = { 14: [e14, w14], 17: [e17, w17], 19: [e19, w19], 25: [e25, w25] } as unknown as Record<
  number,
  [EditionData, ChangeWindow]
>

function edition(n: number) {
  const [ed, w] = fixtures[n]
  const since = sinceYesterday(ed.snapshots, w)
  const entries = deskEntries(ed.snapshots, since.byItem)
  const ctx = copyContext(entries, since, ed.run)
  const items = entries.map((e) => ({ key: e.key, ...itemCopy(e, ctx) }))
  return { entries, ctx, items, headline: pageHeadline(entries, ctx), since: sinceLines(entries, ctx) }
}

function item(n: number, key: string) {
  return edition(n).items.find((i) => i.key === key)!
}

describe('edition 25 (Wed 28 Oct, 02:30 IST)', () => {
  it('page headline', () => {
    expect(edition(25).headline).toBe('A severe cyclone is the top story today, and fires are spreading across central India.')
  })

  it('cyclone', () => {
    expect(item(25, 'cyclone:GDACS-TC-1001345')).toMatchObject({
      title: 'Cyclone Arnab',
      standfirst: 'Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h.',
    })
  })

  it('Chhattisgarh: the jump, against the usual and the baseline’s busiest day', () => {
    expect(item(25, 'fire:chhattisgarh')).toMatchObject({
      title: "Chhattisgarh's fires jump to nine times normal",
      // The fire day is Monday 26 Oct: two days before this 02:30 edition, so not "yesterday".
      standfirst:
        '27 fires on Monday across 10 districts, where late October usually sees about 3. ' +
        "That's more than on any day at this time of year in 2024 or 2025.",
    })
  })

  it('Madhya Pradesh: the most fires of the states above normal (not "of any state": the edition only holds these)', () => {
    expect(item(25, 'fire:madhya-pradesh')).toMatchObject({
      title: 'Madhya Pradesh has the most fires of the five states above normal',
      standfirst: '200 on Monday, about three times usual, though still within its range for the season.',
    })
  })

  it('the other fire states run at their multiple', () => {
    expect(item(25, 'fire:telangana').title).toBe("Telangana's fires run at six times normal")
    expect(item(25, 'fire:uttar-pradesh').standfirst).toBe(
      "115 fires on Monday across 45 districts, where late October usually sees about 40. That's within its range for the season.",
    )
  })

  it('air', () => {
    expect(item(25, 'air:IN')).toMatchObject({
      title: 'Air is very poor in Panipat and poor in 16 more cities',
      standfirst:
        "Panipat, in Haryana, is worst, at 301 on India's air quality index, which the Central Pollution Control Board rates very poor. " +
        "16 more cities are poor, out of 267 reporting. These are the board's live readings, before its own checks.",
    })
  })

  it('since yesterday', () => {
    expect(edition(25).since.map((l) => `${l.tag} ${l.text} (${l.levels})`)).toEqual([
      "+ NEW Chhattisgarh's fires jump to nine times normal (Level 2 · Elevated)",
      "− CLOSED Gujarat's fires have stayed under twice normal for two days (was Level 1)",
    ])
  })
})

describe('edition 17 (Sun 25 Oct, 14:30 IST)', () => {
  it('page headline: fires lead, spreading from none a day earlier', () => {
    expect(edition(17).headline).toBe('Fires are the top story today, spreading to four states, led by Gujarat at eight times normal.')
  })

  it('new, reopened and most-fires states; the fire day is yesterday for a 14:30 edition', () => {
    expect(item(17, 'fire:gujarat')).toMatchObject({
      title: "Gujarat's fires jump to eight times normal",
      standfirst:
        '46 fires yesterday across 14 districts, where late October usually sees about 6. ' +
        "That's more than on any day at this time of year in 2024 or 2025.",
    })
    expect(item(17, 'fire:madhya-pradesh')).toMatchObject({
      title: "Madhya Pradesh's fires flare up again, at three times normal",
      standfirst:
        '185 fires yesterday across 31 districts, the most of the four states above normal, where late October usually sees about 70. ' +
        "That's within its range for the season.",
    })
  })

  it('Level 1 quakes, grouped', () => {
    const { entries, items } = edition(17)
    const group = entries.find((e) => e.members.length > 0)!
    expect(items.find((i) => i.key === group.key)!.title).toBe("Two small earthquakes strike near India's borders")
    expect(group.members.map(quakeMemberLine)).toEqual([
      'Magnitude 4.6, 91 km from Tuensang, India',
      'Magnitude 4.3, 71 km from Rikaze, China',
    ])
  })

  it('air at Level 1', () => {
    expect(item(17, 'air:IN').title).toBe('Air is poor in six cities, worst in Khairthal')
  })

  it('since yesterday: the M7.0 closed after two days', () => {
    expect(edition(17).since.at(-1)).toMatchObject({
      tag: '− CLOSED',
      text: 'The major earthquake 350 km outside India leaves the report after two days',
    })
  })
})

describe('edition 19 (Mon 26 Oct, 02:30 IST, a failed run)', () => {
  it('the same fire stories, dated Saturday: the figures are last known from No. 17', () => {
    expect(item(19, 'fire:gujarat').standfirst).toBe(
      '46 fires on Saturday across 14 districts, where late October usually sees about 6. ' +
        "That's more than on any day at this time of year in 2024 or 2025.",
    )
    expect(edition(19).headline).toBe('Fires are the top story today, spreading to four states, led by Gujarat at eight times normal.')
  })
})

describe('edition 14 (Sat 24 Oct, 14:30 IST)', () => {
  it('page headline: a quake leads, air follows', () => {
    expect(edition(14).headline).toBe(
      'A major earthquake 350 km outside India is the top story today, and air is very poor in three cities.',
    )
  })

  it('the quake: what happened, then the source in words', () => {
    expect(item(14, 'earthquake:USGS-us6000u43g')).toMatchObject({
      title: 'Major earthquake strikes 350 km outside India',
      standfirst:
        'The magnitude 7.0 quake struck 191 km from Nagqu, China, 18 km below the surface, according to the US Geological Survey. ' +
        'Its alert for likely impact is orange, the second-highest of four. Eight people reported feeling it.',
    })
  })

  it('air with three very poor cities', () => {
    expect(item(14, 'air:IN')).toMatchObject({
      title: 'Air is very poor in three cities and poor in 10 more cities',
      standfirst:
        "Baraut, in Uttar Pradesh, is worst, at 335 on India's air quality index, which the Central Pollution Control Board rates very poor. " +
        "Meerut and Gajraula are also very poor, and 10 more cities are poor, out of 264 reporting. These are the board's live readings, before its own checks.",
    })
  })
})

describe('words', () => {
  it('translates multiples and rounds', () => {
    expect([9.07, 6.11, 2.91, 2.1, 1.5].map(timesNormal)).toEqual([
      'nine times normal',
      'six times normal',
      'three times normal',
      'twice normal',
      'one and a half times normal',
    ])
    expect(timesUsual(2.91)).toBe('about three times usual')
    expect(timesNormal(23)).toBe('25 times normal')
    expect([2.98, 68.7, 42.0, 137, 0.2].map(aboutCount)).toEqual(['about 3', 'about 70', 'about 40', 'about 140', 'almost none'])
    expect([47.8, 347.9, 1234].map(roundKm)).toEqual([50, 350, 1250])
  })

  it('dates relative to the edition, not the reader', () => {
    const wed0230 = '2026-10-27T21:00:00Z' // Wed 28 Oct, 02:30 IST
    expect(relativeDay('2026-10-28', wed0230)).toBe('today')
    expect(relativeDay('2026-10-27', wed0230)).toBe('yesterday')
    expect(relativeDay('2026-10-26', wed0230)).toBe('on Monday')
    expect(relativeDay('2026-10-19', wed0230)).toBe('on 19 Oct')
    expect([partOfMonth('2026-10-26'), partOfMonth('2026-10-15'), partOfMonth('2026-11-02')]).toEqual([
      'late October',
      'mid-October',
      'early November',
    ])
    expect(inYears('2024-2025')).toBe('in 2024 or 2025')
  })

  it('says where fire states are', () => {
    expect(whereStates(['Chhattisgarh', 'Telangana', 'Maharashtra', 'Madhya Pradesh', 'Uttar Pradesh']).inText).toBe(
      'across central India',
    )
    expect(whereStates(['Punjab', 'Haryana', 'Uttar Pradesh']).inText).toBe('across northern India')
    expect(whereStates(['Punjab', 'Haryana', 'Gujarat']).inText).toBe('across northern and western India')
    expect(whereStates(['Gujarat', 'Telangana', 'Maharashtra', 'Madhya Pradesh']).spreadText).toBe('to four states')
    expect(whereStates(['Gujarat', 'Telangana']).inText).toBe('in Gujarat and Telangana')
  })

  it('names cyclones as people say them', () => {
    expect(cycloneName('Tropical Cyclone ARNAB-26')).toBe('Cyclone Arnab')
    expect(cycloneName('Tropical Cyclone TWO-26')).toBe('An unnamed tropical cyclone')
  })
})
