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
    // A Level 4 item leads by level, even when it only continues.
    expect(edition(25).headline).toBe('Cyclone Arnab holds at red alert.')
  })

  it('cyclone: no position, since a later edition moved it (P1)', () => {
    expect(item(25, 'cyclone:GDACS-TC-1001345')).toMatchObject({
      title: 'Cyclone Arnab',
      standfirst: 'Global disaster monitors give it their highest alert, red, with peak winds of 222 km/h.',
    })
  })

  it('fires: one roundup; a record is the title, the standfirst gives the districts and the benchmark, no cluster counts', () => {
    expect(item(25, 'fire:roundup')).toMatchObject({
      // A record is said once, in the first edition that reports it; this 02:30 edition is the third of its fire day.
      title: 'Fires stay above usual in Chhattisgarh after record day',
      standfirst:
        // The fire day is Monday 26 Oct: two days before this 02:30 edition, so not "yesterday".
        "Satellites picked up more fires in Chhattisgarh on Monday than on any late-October day in two years, across 10 districts. That's about nine times what late October usually sees. " +
        'Telangana, Maharashtra, Madhya Pradesh and Uttar Pradesh are also above usual.',
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
      '+ NEW Fires climb above usual in Chhattisgarh (Level 2 · Elevated)',
      '− CLOSED Fires in Gujarat have stayed at seasonal levels for two days (was Level 1)',
    ])
  })
})

describe('edition 26 (Wed 28 Oct, 14:30 IST): four fire states fall back on an incomplete day', () => {
  it('headline: the news itself, no "top story"; no easing claimed on incomplete counts', () => {
    expect(edition(26).headline).toBe('Cyclone Arnab holds at red alert.')
  })

  it('the cyclone: where global disaster monitors place it, in words', () => {
    expect(item(26, 'cyclone:GDACS-TC-1001345').standfirst).toBe(
      'Global disaster monitors give it their highest alert, red, with peak winds of 222 km/h. They place it near the Andhra Pradesh coast.',
    )
  })

  it('fires: the one state still above usual, busy but within its range: no news, a plain title; those that fell back are in Since yesterday', () => {
    expect(item(26, 'fire:roundup')).toEqual({
      key: 'fire:roundup',
      title: 'Fires stay above usual in Madhya Pradesh',
      standfirst: "Satellites picked up fires in 21 Madhya Pradesh districts yesterday. That's about double what late October usually sees.",
    })
  })

  it('air: the worst city, then the rest, one fact a sentence', () => {
    expect(item(26, 'air:IN').standfirst).toBe(
      "Panipat had the worst air in the country, with an index of 293, just short of 'very poor'. 22 other cities were rated poor.",
    )
  })

  it('since yesterday: the four states that fell back share one line', () => {
    expect(edition(26).since.map((l) => `${l.tag} ${l.text} (${l.levels})`)).toEqual([
      '▼ DOWN Fires ease back to seasonal levels across central India (Level 2 → 1)',
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
    // The red alert is Level 4 and leads by level; easing, said for the first time, follows.
    expect(pageHeadline(entries, ctx)).toBe('Cyclone Arnab holds at red alert as fires ease across central India.')
    expect(itemCopy(entries.find((e) => e.key === 'fire:roundup')!, ctx)).toEqual({
      title: 'Fires ease back to seasonal levels across central India, Madhya Pradesh still above usual',
      standfirst:
        'Maharashtra, Uttar Pradesh, Telangana and Chhattisgarh are back to seasonal levels. ' +
        "Satellites picked up fires in 21 Madhya Pradesh districts yesterday. That's about double what late October usually sees.",
    })
  })
})

describe('edition 17 (Sun 25 Oct, 14:30 IST)', () => {
  it('page headline: fires lead, four states up from none a day earlier', () => {
    expect(edition(17).headline).toBe('Gujarat sees its busiest late-October fire day in two years.')
  })

  it('the roundup; the fire day is yesterday for a 14:30 edition', () => {
    expect(item(17, 'fire:roundup')).toMatchObject({
      title: 'Gujarat sees its busiest late-October fire day in two years',
      standfirst:
        "Satellites picked up more fires in Gujarat yesterday than on any late-October day in two years, across 14 districts. That's about eight times what late October usually sees. " +
        'Telangana, Maharashtra and Madhya Pradesh are also above usual.',
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
    expect(item(19, 'fire:roundup').standfirst).toMatch(/^Satellites picked up more fires in Gujarat on Saturday than on any late-October day in two years, across 14 districts\. /)
    // The record was said in No. 17; this later edition of the fire day says where the states stand.
    expect(edition(19).headline).toBe('Fires stay above usual in Gujarat after record day.')
  })
})

describe('edition 14 (Sat 24 Oct, 14:30 IST)', () => {
  it('page headline: a quake leads, air follows', () => {
    expect(edition(14).headline).toBe(
      'A major earthquake struck 350 km outside India.',
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

  function roundup(snapshots: EditionData['snapshots'], window: ChangeWindow | null) {
    const since = window ? sinceYesterday(snapshots, window) : null
    const entries = deskEntries(snapshots, since?.byItem ?? new Map())
    const ctx = copyContext(entries, since, { ...ed25.run, started_at: '2026-10-27T09:00:00Z' })
    return itemCopy(entries.find((e) => e.key === 'fire:roundup')!, ctx)
  }

  it('the title names the story, not a count of states: a record, else the state that moved; the standout opens the standfirst', () => {
    // A record for the season: the record state is the title.
    expect(roundup(ed25.snapshots, w25_).title).toBe('Chhattisgarh sees its busiest late-October fire day in two years')
    expect(roundup(ed25.snapshots, null).standfirst).toMatch(/^Satellites picked up more fires in Chhattisgarh (on Monday|yesterday) than on any late-October day in two years, across 10 districts\./)
    // No record, and Chhattisgarh rose in this edition's own run: it climbs, with the benchmark after the comma.
    const rose = withFigures(25, 'fire:chhattisgarh', { norm_max_daily_events: 400 }).map((s) => (s.item_id === 'fire:chhattisgarh' ? { ...s, change: 'opened' as const } : s))
    expect(roundup(rose, w25_).title).toBe('Fires climb in Chhattisgarh, nine times the usual for late October')
    // Nobody moved and nothing is a record: where the states stand, with no count of states.
    const steady = withFigures(25, 'fire:chhattisgarh', { norm_max_daily_events: 400 }).map((s) => ({ ...s, change: null }))
    expect(roundup(steady, null).title).toMatch(/^Fires stay above usual /)
  })

  it('no roundup title carries bookkeeping words', () => {
    for (const n of [17, 19, 25, 26]) {
      const t = edition(n).items.find((i) => i.key === 'fire:roundup')?.title
      if (t) expect(t, `No. ${n}`).not.toMatch(/now including|led by|of them new|up from|the most in|spreading/i)
    }
  })

  it('a lone fire state gets its own story: the plain multiple in the title, the average in the standfirst', () => {
    const only = ed25.snapshots.filter((s) => s.category !== 'fire' || s.item_id === 'fire:telangana')
    const entries = deskEntries(only, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    const fire = entries.find((e) => e.category === 'fire')!
    expect(fire.key).toBe('fire:telangana')
    expect(itemCopy(fire, ctx)).toEqual({
      title: 'Fires stay above usual in Telangana',
      standfirst: "Satellites picked up fires in 17 Telangana districts on Monday. That's about six times what late October usually sees.",
    })
  })

  it('a Level 3 state gets its own story; the roundup covers the rest', () => {
    const l3 = ed25.snapshots.map((s) => (s.item_id === 'fire:telangana' ? { ...s, severity_level: 3 as const } : s))
    const entries = deskEntries(l3, new Map())
    const ctx = copyContext(entries, null, ed25.run)
    expect(entries.map((e) => e.key)).toEqual(['cyclone:GDACS-TC-1001345', 'fire:telangana', 'air:IN', 'fire:roundup'])
    expect(itemCopy(entries[1], ctx).title).toBe('Fires stay above usual in Telangana, six times the usual for late October')
    expect(itemCopy(entries[3], ctx).title).toMatch(/^(Chhattisgarh sees|Fires stay above usual )/)
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


describe('the page headline rules (docs/style-guide.md, The page headline)', () => {
  const BOOKKEEPING = /one of them new|now including|both new|all new|led by|on the desk|top story|\bnew\b/i

  function headlineOf(snapshots: EditionData['snapshots'], window: ChangeWindow | null, run = fixtures[25][0].run) {
    const since = window ? sinceYesterday(snapshots, window) : null
    const entries = deskEntries(snapshots, since?.byItem ?? new Map())
    return pageHeadline(entries, copyContext(entries, since, run))
  }

  it('every real edition: about twelve words, no bookkeeping', () => {
    for (const n of [14, 17, 19, 25, 26]) {
      const h = edition(n).headline
      expect(h, `No. ${n}`).not.toMatch(BOOKKEEPING)
      expect(h.split(/\s+/).length, `No. ${n}: ${h}`).toBeLessThanOrEqual(12)
    }
  })

  it('a storm that has crossed the coast: "Cyclone Arnab crosses the Andhra coast and weakens."', () => {
    const [ed, w] = fixtures[25]
    const crossed = ed.snapshots
      .filter((s) => s.category === 'cyclone')
      .map((s) => ({
        ...s,
        figures: { ...s.figures, wind_kmh: 102, peak_wind_kmh: 222, landfall: { at: '2026-10-27T18:00:00Z', latitude: 16.3, longitude: 81.5, state: 'Andhra Pradesh', district: 'West Godavari' } },
      }))
    expect(headlineOf(crossed, w, ed.run)).toBe('Cyclone Arnab crosses the Andhra coast and weakens.')
  })

  const chhattisgarh = (change: 'opened' | null, patch: Record<string, unknown> = {}) =>
    fixtures[25][0].snapshots
      .filter((s) => s.item_id === 'fire:chhattisgarh')
      .map((s) => ({ ...s, change, figures: { ...s.figures, ...patch } }))
  const noRecord = { norm_max_daily_events: 400 }

  it('fires that rose in this edition lead and the air that stayed follows: "Fires climb in Chhattisgarh as air stays very poor in Panipat."', () => {
    const [ed, w] = fixtures[25]
    const air = (change: 'escalated' | null) => ed.snapshots.filter((s) => s.item_id === 'air:IN').map((s) => ({ ...s, change }))
    const airSteady = { ...w, rows: [...w.rows, { run_id: 22, item_id: 'air:IN', category: 'air' as const, status: 'open' as const, severity_level: 2 as const, change: null }] }
    expect(headlineOf([...air(null), ...chhattisgarh('opened', noRecord)], airSteady, ed.run)).toBe('Fires climb in Chhattisgarh as air stays very poor in Panipat.')
    // Air that turned in this edition is a move too: the tie goes to the category order, air first.
    const airUp = { ...w, rows: [...w.rows.filter((r) => r.item_id !== 'air:IN'), { run_id: 22, item_id: 'air:IN', category: 'air' as const, status: 'open' as const, severity_level: 1 as const, change: null }] }
    expect(headlineOf([...air('escalated'), ...chhattisgarh('opened', noRecord)], airUp, ed.run)).toBe('Air turns very poor in Panipat as fires climb in Chhattisgarh.')
  })

  it('a one-time verb only in the first edition that reports the change; later editions say where things stand', () => {
    const [ed, w] = fixtures[25]
    // Fires: the edition whose own run opened the state flares (or surges, with a record); the next one stays high.
    expect(headlineOf(chhattisgarh('opened', noRecord), w, ed.run)).toBe('Fires climb in Chhattisgarh, nine times the usual for late October.')
    expect(headlineOf(chhattisgarh('opened'), w, ed.run)).toBe('Chhattisgarh sees its busiest late-October fire day in two years.')
    expect(headlineOf(chhattisgarh(null, noRecord), w, ed.run)).toBe('Fires stay above usual in Chhattisgarh.')
    // Air: "turns" once, then "stays".
    const air = (change: 'escalated' | null) => ed.snapshots.filter((s) => s.item_id === 'air:IN').map((s) => ({ ...s, change }))
    expect(headlineOf(air('escalated'), w, ed.run)).toBe('Air turns very poor in Panipat.')
    expect(headlineOf(air(null), w, ed.run)).toBe('Air stays very poor in Panipat.')
    // A storm: "crosses the coast" within the run that found the landfall, then "weakens inland".
    const land = { at: '2026-10-27T18:00:00Z', latitude: 16.3, longitude: 81.5, state: 'Andhra Pradesh', district: 'West Godavari' }
    const storm = ed.snapshots.filter((s) => s.category === 'cyclone').map((s) => ({ ...s, figures: { ...s.figures, wind_kmh: 102, peak_wind_kmh: 222, landfall: land } }))
    const at = (iso: string) => ({ ...ed.run, started_at: iso })
    expect(headlineOf(storm, w, at('2026-10-27T21:00:00Z'))).toBe('Cyclone Arnab crosses the Andhra coast and weakens.')
    expect(headlineOf(storm, w, at('2026-10-28T03:00:00Z'))).toBe('Cyclone Arnab weakens inland over Andhra Pradesh.')
    expect(headlineOf(storm, w, at('2026-10-28T09:00:00Z'))).toBe('Cyclone Arnab weakens inland over Andhra Pradesh.')
    // A quake: "strikes" in its first edition, "struck" after.
    const quake = (change: 'opened' | null) => fixtures[14][0].snapshots.filter((s) => s.item_id === 'earthquake:USGS-us6000u43g').map((s) => ({ ...s, change }))
    expect(headlineOf(quake('opened'), null, fixtures[14][0].run)).toBe('A major earthquake strikes 350 km outside India.')
    expect(headlineOf(quake(null), null, fixtures[14][0].run)).toBe('A major earthquake struck 350 km outside India.')
  })

  it('regions always read north to south: "central and western India", never the reverse', () => {
    for (const [states, text] of [
      [['Gujarat', 'Maharashtra', 'Madhya Pradesh'], 'across central and western India'],
      [['Telangana', 'Maharashtra', 'Karnataka', 'Gujarat'], 'across western and southern India'],
      [['Rajasthan', 'Gujarat', 'Maharashtra'], 'across northern and western India'],
    ] as [string[], string][]) {
      expect(whereStates(states).inText).toBe(text)
      expect(whereStates([...states].reverse()).inText).toBe(text)
    }
  })

  it('names at most two places, and drops the second event when it would not fit', () => {
    const [ed, w] = fixtures[25]
    const h = headlineOf(ed.snapshots, w, ed.run)
    expect(h).toBe('Cyclone Arnab holds at red alert.')
    // Three places would be too many: air names Panipat, fires would name two states.
    const two = ed.snapshots.filter((s) => ['air:IN', 'fire:chhattisgarh', 'fire:telangana'].includes(s.item_id)).map((s) => (s.category === 'fire' ? { ...s, change: 'opened' as const } : s))
    expect(headlineOf(two, w, ed.run).match(/Panipat|Chhattisgarh|Telangana/g)?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('a quiet edition: "A quiet day across India, with nothing above minor."', () => {
    const [ed, w] = fixtures[25]
    const calm = ed.snapshots.map((s) => ({ ...s, severity_level: 1 as const }))
    expect(headlineOf(calm, w, ed.run)).toBe('A quiet day across India, with nothing above minor.')
  })
})

describe('roundup rules from 15 Nov 2026', () => {
  const [ed25] = fixtures[25]
  const [ed26, w26_] = fixtures[26]

  it('"N-year high" counts the years the norm covers, from the edition itself, never a fixed two', () => {
    const titleOf = (patch: (s: EditionData['snapshots'][number]) => EditionData['snapshots'][number], run = ed25.run) => {
      const snaps = ed25.snapshots.filter((s) => s.item_id === 'fire:chhattisgarh').map(patch)
      const entries = deskEntries(snaps, new Map())
      return itemCopy(entries[0], copyContext(entries, null, { ...run, started_at: '2026-10-27T09:00:00Z' })).title
    }
    expect(titleOf((s) => s)).toMatch(/busiest late-October fire day in two years$/)                                    // norm_years 2024-2025
    expect(titleOf((s) => ({ ...s, figures: { ...s.figures, norm_years: '2023-2025' } }))).toMatch(/in three years$/)
    // Without norm_years in the figures: the years in the edition's own stored config.
    const noYears = (s: EditionData['snapshots'][number]) => ({ ...s, figures: { ...s.figures, norm_years: undefined } })
    const config = { fire: { baseline: { years: [2023, 2024, 2025] } } } as unknown as typeof ed25.run.severity_config
    expect(titleOf(noYears, { ...ed25.run, severity_config: config })).toMatch(/in three years$/)
    const six = { fire: { baseline: { years: [2020, 2021, 2022, 2023, 2024, 2025] } } } as unknown as typeof ed25.run.severity_config
    expect(titleOf(noYears, { ...ed26.run, severity_config: six })).toMatch(/in six years$/)
  })

  it('states all back near normal: "Fires ease …" in the first edition only, then no roundup', () => {
    const calm = (change: 'deescalated' | null) =>
      ed26.snapshots.filter((s) => s.category === 'fire').map((s) => ({ ...s, severity_level: 1 as const, change }))
    const first = deskEntries(calm('deescalated'), new Map())
    const roundup = first.find((e) => e.key === 'fire:roundup')!
    expect(itemCopy(roundup, copyContext(first, null, ed26.run)).title).toMatch(/^Fires ease back to seasonal levels (across|in) /)
    // The next edition: the same states, no change in its own run: no row for them at all.
    const later = deskEntries(calm(null), new Map())
    expect(later.some((e) => e.category === 'fire')).toBe(false)
    // Easing alone is a headline (a move said for the first time), never the quiet-day line.
    const complete = calm('deescalated').map((s) => ({ ...s, figures: { ...s.figures, data_to: '2026-10-27T21:40:00+00:00' } }))
    const since = sinceYesterday(complete, w26_)
    const entries = deskEntries(complete, since.byItem)
    expect(pageHeadline(entries, copyContext(entries, since, { ...ed26.run, started_at: '2026-10-28T09:00:00Z' }))).toBe('Fires ease back to seasonal levels across central India.')
    // A state still above normal keeps the roundup in every edition.
    const mixed = ed26.snapshots.filter((s) => s.category === 'fire').map((s, i) => ({ ...s, severity_level: (i === 1 ? 2 : 1) as 1 | 2, change: null }))
    expect(deskEntries(mixed, new Map()).some((e) => e.category === 'fire')).toBe(true)
  })
})
