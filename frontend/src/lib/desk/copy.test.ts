import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext, cycloneName, itemCopy, pageHeadline, quakeMemberLine, sinceLines } from './copy'
import { deskEntries } from './entries'
import type { ChangeWindow, EditionData } from './types'
import { placeOf, placeText } from './where'
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
import e26 from './__fixtures__/edition-26.json'
import w14 from './__fixtures__/window-14.json'
import w17 from './__fixtures__/window-17.json'
import w19 from './__fixtures__/window-19.json'
import w25 from './__fixtures__/window-25.json'
import w26 from './__fixtures__/window-26.json'

// The copy for real editions, held to the letter (docs/style-guide.md). Every
// line comes from the edition's own data, so these are also the archive's words.
const fixtures = { 14: [e14, w14], 17: [e17, w17], 19: [e19, w19], 25: [e25, w25], 26: [e26, w26] } as unknown as Record<
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
    expect(edition(25).headline).toBe('Cyclone Arnab holds at red alert as fires spread across central India.')
  })

  it('cyclone', () => {
    expect(item(25, 'cyclone:GDACS-TC-1001345')).toMatchObject({
      title: 'Cyclone Arnab',
      standfirst: 'Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h.',
    })
  })

  it('fires: one roundup, led by the strongest angle (a spike in Chhattisgarh), the multiple once', () => {
    expect(item(25, 'fire:roundup')).toMatchObject({
      title: 'Fires run above normal in five states, led by a spike in Chhattisgarh',
      standfirst:
        // The fire day is Monday 26 Oct: two days before this 02:30 edition, so not "yesterday".
        'Chhattisgarh, newly above normal, had 27 fires on Monday, about nine times usual for late October and more than on any day ' +
        "at this time of year in 2024 or 2025. Madhya Pradesh had the most, with 200, though that's within its range for the season. " +
        'Telangana, Maharashtra and Uttar Pradesh are also above normal.',
    })
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
      "+ NEW Chhattisgarh's fires jump above normal (Level 2 · Elevated)",
      "− CLOSED Gujarat's fires have stayed down for two days (was Level 1)",
    ])
  })
})

describe('edition 26 (Wed 28 Oct, 14:30 IST): four fire states fall back on an incomplete day', () => {
  it('headline: the news itself, no "top story"; no easing claimed on incomplete counts', () => {
    expect(edition(26).headline).toBe("Cyclone Arnab holds at red alert as Madhya Pradesh's fires run well above normal.")
  })

  it('the cyclone: where the area global disaster monitors map for it is centred (not the storm itself)', () => {
    expect(item(26, 'cyclone:GDACS-TC-1001345').standfirst).toBe(
      'Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h. ' +
        'The area they map for it is centred in the Bay of Bengal, just off the Andhra Pradesh coast.',
    )
  })

  it('fires: the one state still above normal leads; the others are named; the gap in the data is said', () => {
    expect(item(26, 'fire:roundup')).toEqual({
      key: 'fire:roundup',
      title: "Madhya Pradesh's fires run well above normal",
      standfirst:
        "145 fires yesterday across 21 districts, about twice the usual for late October. That's within its range for the season. " +
        'Maharashtra, Uttar Pradesh, Telangana and Chhattisgarh have dropped back on these counts. ' +
        "The counts for yesterday are incomplete: nothing had come in from NASA's fire satellites after 14:37 IST.",
    })
  })

  it('since yesterday: the four states that fell back share one line', () => {
    expect(edition(26).since.map((l) => `${l.tag} ${l.text} (${l.levels})`)).toEqual([
      '▼ DOWN Fires fall back toward normal in four states: Maharashtra, Uttar Pradesh, Telangana and Chhattisgarh (Level 2 → 1)',
    ])
  })

  it('with a complete day, the same edition leads with easing', () => {
    const [ed, w] = fixtures[26]
    const complete = ed.snapshots.map((s) =>
      s.category === 'fire' ? { ...s, figures: { ...s.figures, data_to: '2026-10-27T21:40:00+00:00' } } : s,
    )
    const since = sinceYesterday(complete, w)
    const entries = deskEntries(complete, since.byItem)
    const ctx = copyContext(entries, since, ed.run)
    expect(pageHeadline(entries, ctx)).toBe('Cyclone Arnab holds at red alert as fires ease across central India.')
    expect(itemCopy(entries.find((e) => e.key === 'fire:roundup')!, ctx)).toEqual({
      title: 'Fires ease across central India, with Madhya Pradesh still above normal',
      standfirst:
        'Maharashtra, Uttar Pradesh, Telangana and Chhattisgarh fell back toward normal since yesterday. ' +
        "Madhya Pradesh is still above normal, with 145 fires yesterday, about twice the usual for late October, though that's within its range for the season.",
    })
  })
})

describe('edition 17 (Sun 25 Oct, 14:30 IST)', () => {
  it('page headline: fires lead, spreading from none a day earlier, led by a spike in Gujarat', () => {
    expect(edition(17).headline).toBe('Fires spread to four states, led by a spike in Gujarat.')
  })

  it('the roundup; the fire day is yesterday for a 14:30 edition', () => {
    expect(item(17, 'fire:roundup')).toMatchObject({
      title: 'Fires run above normal in four states, led by a spike in Gujarat',
      standfirst:
        'Gujarat, newly above normal, had 46 fires yesterday, about eight times usual for late October and more than on any day ' +
        "at this time of year in 2024 or 2025. Madhya Pradesh had the most, with 185, though that's within its range for the season. " +
        'Telangana and Maharashtra are also above normal.',
    })
  })

  it('Level 1 quakes, grouped', () => {
    const { entries, items } = edition(17)
    const group = entries.find((e) => e.category === 'earthquake')!
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
      text: 'Two days have passed since the major earthquake 350 km outside India',
    })
  })
})

describe('edition 19 (Mon 26 Oct, 02:30 IST, a failed run)', () => {
  it('the same roundup, dated Saturday: the figures are last known from No. 17', () => {
    expect(item(19, 'fire:roundup').standfirst).toMatch(/^Gujarat, newly above normal, had 46 fires on Saturday, /)
    expect(edition(19).headline).toBe('Fires spread to four states, led by a spike in Gujarat.')
  })
})

describe('edition 14 (Sat 24 Oct, 14:30 IST)', () => {
  it('page headline: a quake leads, air follows', () => {
    expect(edition(14).headline).toBe(
      'A major earthquake strikes 350 km outside India as air turns very poor in three cities.',
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

describe('fire roundup rules', () => {
  const [ed25, w25_] = fixtures[25]

  function withFigures(n: number, key: string, patch: Record<string, unknown>) {
    return fixtures[n][0].snapshots.map((s) => (s.item_id === key ? { ...s, figures: { ...s.figures, ...patch } } : s))
  }

  function roundupTitle(snapshots: EditionData['snapshots'], window: ChangeWindow | null) {
    const since = window ? sinceYesterday(snapshots, window) : null
    const entries = deskEntries(snapshots, since?.byItem ?? new Map())
    const ctx = copyContext(entries, since, ed25.run)
    return itemCopy(entries.find((e) => e.key === 'fire:roundup')!, ctx).title
  }

  it('angle order: record, then new, then spreading, then the largest count, then the multiple', () => {
    const noRecord = withFigures(25, 'fire:chhattisgarh', { norm_max_daily_events: 40 })
    expect(roundupTitle(noRecord, w25_)).toBe('Fires run above normal in five states, now including Chhattisgarh')
    // Without the comparison there is nothing new or spreading: the largest count leads.
    expect(roundupTitle(noRecord, null)).toBe('Fires run above normal in five states, the most in Madhya Pradesh')
    // Spreading: more states above normal than a day earlier, none of them new.
    // A day earlier: Uttar Pradesh not yet above normal, Chhattisgarh already was (so not new).
    const spreading = {
      ...w25_,
      rows: w25_.rows.filter((r) => r.item_id !== 'fire:uttar-pradesh' && !(r.item_id === 'fire:chhattisgarh' && r.change === 'opened')),
    }
    const old = noRecord.map((s) => (s.item_id === 'fire:chhattisgarh' ? { ...s, change: null } : s))
    const oldWindow = { ...spreading, rows: [...spreading.rows, { run_id: 22, item_id: 'fire:chhattisgarh', category: 'fire' as const, status: 'open' as const, severity_level: 2 as const, change: null }] }
    expect(roundupTitle(old, oldWindow)).toBe('Fires run above normal in five states, up from four')
  })

  it('a lone fire state gets its own story, with no multiple in the title', () => {
    const only = ed25.snapshots.filter((s) => s.category !== 'fire' || s.item_id === 'fire:telangana')
    const entries = deskEntries(only, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    const fire = entries.find((e) => e.category === 'fire')!
    expect(fire.key).toBe('fire:telangana')
    expect(itemCopy(fire, ctx)).toEqual({
      title: "Telangana's fires run well above normal",
      standfirst:
        "39 fires on Monday across 17 districts, about six times usual for late October. That's within its range for the season.",
    })
  })

  it('a Level 3 state gets its own story; the roundup covers the rest', () => {
    const l3 = ed25.snapshots.map((s) => (s.item_id === 'fire:telangana' ? { ...s, severity_level: 3 as const } : s))
    const entries = deskEntries(l3, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    expect(entries.map((e) => e.key)).toEqual(['cyclone:GDACS-TC-1001345', 'fire:telangana', 'air:IN', 'fire:roundup'])
    expect(itemCopy(entries[1], ctx).title).toBe("Telangana's fires run far above normal")
    expect(itemCopy(entries[3], ctx).title).toBe('Fires also run above normal in four more states, led by a spike in Chhattisgarh')
  })

  it('no title or headline carries a multiple of normal', () => {
    for (const n of [14, 17, 19, 25, 26]) {
      const { headline, items, since } = edition(n)
      for (const t of [headline, ...items.map((i) => i.title), ...since.map((l) => l.text)]) {
        expect(t, `No. ${n}: ${t}`).not.toMatch(/times normal|twice normal|×/)
      }
    }
  })

  it('no copy refers to itself: never "top story", "on the desk", "this report", "this edition", "the list"', () => {
    for (const n of [14, 17, 19, 25, 26]) {
      const { headline, items, since } = edition(n)
      for (const t of [headline, ...items.flatMap((i) => [i.title, i.standfirst ?? '']), ...since.map((l) => l.text)]) {
        expect(t, `No. ${n}: ${t}`).not.toMatch(/top story|on the desk|this report|this edition|the list|the report/i)
      }
    }
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

  it('places a point in plain words: sea, nearest Indian coast, rounded; no sea name near other countries', () => {
    const at = (lat: number, lon: number) => placeText(placeOf(lat, lon))
    expect(at(15.0, 87.0)).toBe('in the Bay of Bengal, about 480 km off the Andhra Pradesh coast')
    expect(at(19.0, 87.5)).toBe('in the Bay of Bengal, about 160 km off the Odisha coast')
    expect(at(18.9, 70.5)).toBe('in the Arabian Sea, about 200 km off the Gujarat coast')
    expect(at(21.15, 79.09)).toBe('over land, about 570 km from the Andhra Pradesh coast') // Nagpur
    expect(at(23.8, 90.4)).toBe('about 250 km from the West Bengal coast') // Dhaka: no sea, no country claimed
    expect(at(12.0, 96.0)).toBe('in the Andaman Sea, about 230 km off the Andaman and Nicobar Islands')
  })

  it('names cyclones as people say them', () => {
    expect(cycloneName('Tropical Cyclone ARNAB-26')).toBe('Cyclone Arnab')
    expect(cycloneName('Tropical Cyclone TWO-26')).toBe('An unnamed tropical cyclone')
  })
})
