import { describe, expect, it } from 'vitest'
import { sinceYesterday } from './changes'
import { copyContext, cycloneName, itemCopy, pageHeadline, quakeMemberLine, sinceLines } from './copy'
import { deskEntries } from './entries'
import type { ChangeWindow, EditionData } from './types'
import { placeOf, placeText } from './where'
import {
  partOfMonth,
  relativeDay,
  roundKm,
  timesAverage,
  theUsual,
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

  it('cyclone: no position, since a later edition moved it (P1)', () => {
    expect(item(25, 'cyclone:GDACS-TC-1001345')).toMatchObject({
      title: 'Cyclone Arnab',
      standfirst: 'Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h.',
    })
  })

  it('fires: one roundup, led by the strongest angle (a spike in Chhattisgarh)', () => {
    expect(item(25, 'fire:roundup')).toMatchObject({
      title: 'Fires run above normal in five states, led by a spike in Chhattisgarh',
      standfirst:
        // The fire day is Monday 26 Oct: two days before this 02:30 edition, so not "yesterday".
        'Chhattisgarh logged 27 fires on Monday across 10 districts, about nine times the late-October average and a two-year high ' +
        'for the season. Madhya Pradesh had the most fires, 200, about three times the late-October average but normal for the season. ' +
        'Telangana, Maharashtra and Uttar Pradesh are also above normal.',
    })
  })

  it('air', () => {
    expect(item(25, 'air:IN')).toMatchObject({
      title: 'Air is very poor in Panipat and poor in 16 more cities',
      standfirst: "Panipat had the worst air in the country, with an index of 301, rated 'very poor'. 16 other cities were rated poor.",
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
    expect(edition(26).headline).toBe("Cyclone Arnab holds at red alert as Madhya Pradesh's fires run at twice the usual.")
  })

  it('the cyclone: where global disaster monitors place it, in words', () => {
    expect(item(26, 'cyclone:GDACS-TC-1001345').standfirst).toBe(
      'Global disaster monitors give it their highest alert, red, with winds of up to 222 km/h. They place it near the Andhra Pradesh coast.',
    )
  })

  it('fires: the one state still above normal, said plainly; those that fell back are in Since yesterday', () => {
    expect(item(26, 'fire:roundup')).toEqual({
      key: 'fire:roundup',
      title: "Madhya Pradesh's fires run at twice the usual",
      standfirst:
        'Madhya Pradesh logged 145 fires yesterday across 21 districts, about double the late-October average but normal for the season.',
    })
  })

  it('air: the worst city, then the rest, one fact a sentence', () => {
    expect(item(26, 'air:IN').standfirst).toBe(
      "Panipat had the worst air in the country, with an index of 293, just short of 'very poor'. 22 other cities were rated poor.",
    )
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
        'Madhya Pradesh logged 145 fires yesterday across 21 districts, about double the late-October average but normal for the season.',
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
        'Gujarat logged 46 fires yesterday across 14 districts, about eight times the late-October average and a two-year high for the ' +
        'season. Madhya Pradesh had the most fires, 185, about three times the late-October average but normal for the season. ' +
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
    expect(item(17, 'air:IN')).toMatchObject({
      title: 'Air is poor in six cities, worst in Khairthal',
      standfirst: "Khairthal had the worst air in the country, with an index of 260, rated 'poor'. Five other cities were rated poor.",
    })
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
    expect(item(19, 'fire:roundup').standfirst).toMatch(/^Gujarat logged 46 fires on Saturday across 14 districts, /)
    expect(edition(19).headline).toBe('Fires spread to four states, led by a spike in Gujarat.')
  })
})

describe('edition 14 (Sat 24 Oct, 14:30 IST)', () => {
  it('page headline: a quake leads, air follows', () => {
    expect(edition(14).headline).toBe(
      'A major earthquake strikes 350 km outside India as air turns very poor in three cities.',
    )
  })

  it('the quake: what happened; the alert as the US Geological Survey\'s own', () => {
    expect(item(14, 'earthquake:USGS-us6000u43g')).toMatchObject({
      title: 'Major earthquake strikes 350 km outside India',
      standfirst:
        'The magnitude 7.0 quake struck 191 km from Nagqu, China, 18 km below the surface. ' +
        "The US Geological Survey's alert for likely impact is orange, the second-highest of four. Eight people reported feeling it.",
    })
  })

  it('air with three very poor cities', () => {
    expect(item(14, 'air:IN')).toMatchObject({
      title: 'Air is very poor in three cities and poor in 10 more cities',
      standfirst:
        "Baraut had the worst air in the country, with an index of 335, rated 'very poor'. Meerut and Gajraula were also rated very poor. " +
        '10 more cities were rated poor.',
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

  it('a lone fire state gets its own story: the plain multiple in the title, the average in the standfirst', () => {
    const only = ed25.snapshots.filter((s) => s.category !== 'fire' || s.item_id === 'fire:telangana')
    const entries = deskEntries(only, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    const fire = entries.find((e) => e.category === 'fire')!
    expect(fire.key).toBe('fire:telangana')
    expect(itemCopy(fire, ctx)).toEqual({
      title: "Telangana's fires run at six times the usual",
      standfirst: 'Telangana logged 39 fires on Monday across 17 districts, about six times the late-October average but normal for the season.',
    })
  })

  it('a Level 3 state gets its own story; the roundup covers the rest', () => {
    const l3 = ed25.snapshots.map((s) => (s.item_id === 'fire:telangana' ? { ...s, severity_level: 3 as const } : s))
    const entries = deskEntries(l3, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    expect(entries.map((e) => e.key)).toEqual(['cyclone:GDACS-TC-1001345', 'fire:telangana', 'air:IN', 'fire:roundup'])
    expect(itemCopy(entries[1], ctx).title).toBe("Telangana's fires run at six times the usual")
    expect(itemCopy(entries[3], ctx).title).toBe('Fires also run above normal in four more states, led by a spike in Chhattisgarh')
  })

  it('intensity words match the verdict: no "well/far above normal" or × in titles; at most one multiple in a title', () => {
    for (const n of [14, 17, 19, 25, 26]) {
      const { headline, items, since } = edition(n)
      for (const t of [headline, ...items.map((i) => i.title), ...since.map((l) => l.text)]) {
        expect(t, `No. ${n}: ${t}`).not.toMatch(/times normal|twice normal|×|well above normal/)
        expect((t.match(/times the usual|twice the usual/g) ?? []).length, `No. ${n}: ${t}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('states facts with confidence: caveats are in the source line or Notes, not the story', () => {
    for (const n of [14, 17, 19, 25, 26]) {
      const { headline, items } = edition(n)
      for (const t of [headline, ...items.flatMap((i) => [i.title, i.standfirst ?? ''])]) {
        expect(t, `No. ${n}: ${t}`).not.toMatch(
          /on these counts|before its own checks|estimate|incomplete|according to|not yet confirmed|held at|would be|last known|dropped back/i,
        )
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
    expect([9.07, 6.11, 2.91, 2.1, 1.5, 23].map(theUsual)).toEqual([
      'nine times the usual',
      'six times the usual',
      'three times the usual',
      'twice the usual',
      'one and a half times the usual',
      '25 times the usual',
    ])
    expect(timesUsual(2.91)).toBe('about three times usual')
    expect([2.109, 9.07, 1.5].map((r) => timesAverage(r, 'late October'))).toEqual([
      'about double the late-October average',
      'about nine times the late-October average',
      'about one and a half times the late-October average',
    ])
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
