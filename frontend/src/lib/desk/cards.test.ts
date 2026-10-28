import { describe, expect, it } from 'vitest'
import { entryCard, fireDistricts, worstCities } from './cards'
import { deskEntries } from './entries'
import { SCALE_ROWS } from './scale'
import type { EditionData } from './types'
import e14 from './__fixtures__/edition-14.json'
import e17 from './__fixtures__/edition-17.json'
import e25 from './__fixtures__/edition-25.json'

const editions = { 14: e14, 17: e17, 25: e25 } as unknown as Record<number, EditionData>

function entry(n: number, key: string) {
  const e = deskEntries(editions[n].snapshots).find((x) => x.key === key)
  if (!e) throw new Error(`no ${key} in edition ${n}`)
  return e
}

function cells(n: number, key: string) {
  return entryCard(entry(n, key))!.cells.map((c) => `${c.value} ${c.label}`)
}

describe('entryCard', () => {
  it('fire: districts, fire events, ratio to norm, large fires near towns; the norm and busiest districts', () => {
    expect(cells(25, 'fire:chhattisgarh')).toEqual([
      '10 Districts active',
      '27 Fire events, 26 Oct',
      '9.07× Seasonal norm',
      '0 Large fires near towns',
    ])
    expect(entryCard(entry(25, 'fire:chhattisgarh'))!.text).toBe(
      'In 2024–2025, this time of year averaged 3.0 fire events a day; the busiest day had 16. ' +
        'Busiest districts: Bemetra (8), Rajnandgaon (7), Bilaspur (3).',
    )
  })

  it('air: cities per band and reporting; the worst three with their readings', () => {
    expect(cells(25, 'air:IN')).toEqual(['0 Cities severe', '1 Cities very poor', '16 Cities poor', '267 Cities reporting'])
    expect(entryCard(entry(25, 'air:IN'))!.text).toBe(
      'Worst: Panipat, Haryana, AQI 301 (PM2.5); Gummidipoondi, Tamil Nadu, AQI 268; Bhiwadi, Rajasthan, AQI 260.',
    )
  })

  it('cyclone: GDACS alert, wind speed, alert score, and the GDACS report link', () => {
    const card = entryCard(entry(25, 'cyclone:GDACS-TC-1001345'))!
    expect(card.cells.map((c) => `${c.value} ${c.label}`)).toEqual([
      'Red GDACS alert',
      '222 km/h Max wind speed',
      '3 Alert score',
      '8 GDACS episode',
    ])
    expect(card.link?.href).toContain('gdacs.org/report.aspx?eventid=1001345')
  })

  it('quake: magnitude, depth, distance from India, felt reports; PAGER alert; USGS link', () => {
    const card = entryCard(entry(14, 'earthquake:USGS-us6000u43g'))!
    expect(card.cells.map((c) => `${c.value} ${c.label}`)).toEqual([
      'M7.0 Magnitude (mww)',
      '18 km Depth',
      '348 km From India',
      '8 Felt reports (USGS)',
    ])
    expect(card.text).toBe('USGS PAGER alert: orange.')
    expect(card.link?.href).toBe('https://earthquake.usgs.gov/earthquakes/eventpage/us6000u43g')
  })

  it('none for Level 1 rows and grouped quakes', () => {
    const group = deskEntries(editions[17].snapshots).find((e) => e.members.length > 0)!
    expect(entryCard(group)).toBeNull()
  })

  it('phones get three cells: the fourth is wide-only', () => {
    for (const key of ['fire:chhattisgarh', 'air:IN', 'cyclone:GDACS-TC-1001345']) {
      const shown = entryCard(entry(25, key))!.cells.filter((c) => !c.wideOnly)
      expect(shown.length, key).toBe(3)
    }
  })
})

describe('the phone wire', () => {
  it('lists districts across all fire states, busiest first', () => {
    const { total, top } = fireDistricts(editions[25].snapshots)
    expect(total).toBe(10 + 26 + 12 + 17 + 45)
    expect(top.slice(0, 2)).toEqual([
      { district: 'Guna', state: 'Madhya Pradesh', fireEvents: 39 },
      { district: 'Ashoknagar', state: 'Madhya Pradesh', fireEvents: 25 },
    ])
  })

  it('orders cities by the band they count in, then by reading', () => {
    const air = editions[25].snapshots.find((s) => s.item_id === 'air:IN')!
    expect(worstCities(air.figures).slice(0, 3).map((c) => c.city)).toEqual(['Panipat', 'Gummidipoondi', 'Bhiwadi'])
  })
})

describe('How levels are set', () => {
  it('prints the scale copy, not the mockup’s thresholds', () => {
    const row = (name: string) => SCALE_ROWS.find((r) => r.name === name)!.cells
    expect(row('Quake')).toEqual(['below M5', 'M5–5.9', 'M6–6.9', 'M7+'])
    expect(row('Fire')).toEqual(['below 2× norm', '2–4× norm', '4×+ norm, or forest-fire alert', 'large fire near a town'])
    expect(row('Air')).toEqual(['poor', 'very poor', 'severe, 1 city', 'severe, 3+ cities'])
  })
})
