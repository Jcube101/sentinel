// Key figures for each desk item, per category: the strip of numbers under a
// Level 2+ item, a line of context, and a link to the source's own page.
// Only what the snapshot's figures hold, so past editions print the same.

import { counted, AIR_BANDS, type DeskEntry } from './entries'
import { ratioText } from './headline'
import { SCALE } from './scale'
import type { AirCity, Figures, Snapshot } from './types'

export interface Cell {
  value: string
  label: string
  /** Shorter label for phones. */
  short?: string
  /** Left off on phones, which show three cells. */
  wideOnly?: boolean
}

export interface Card {
  cells: Cell[]
  text: string | null
  link: { href: string; text: string } | null
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A UTC date key ("2026-10-26", FIRMS days are UTC) as "26 Oct". */
function dayText(day: string): string {
  return DAY_FMT.format(new Date(`${day}T00:00:00Z`))
}

/** A daily norm as the pipeline prints it: 3.0, 69. */
export function normText(n: number): string {
  return n < 10 ? n.toFixed(1) : n.toFixed(0)
}

function count(n: number | undefined | null): string {
  return typeof n === 'number' ? n.toLocaleString('en-IN') : '—'
}

function fireCard(f: Figures): Card {
  const cells: Cell[] = [
    { value: count(f.district_count), label: 'Districts active', short: 'Districts' },
    { value: count(f.fire_events), label: f.day ? `Fire events, ${dayText(f.day)}` : 'Fire events', short: 'Fires' },
  ]
  if (typeof f.ratio_to_norm === 'number') {
    cells.push({ value: `${ratioText(f.ratio_to_norm)}×`, label: 'Seasonal norm', short: 'Norm' })
  }
  cells.push({
    value: count(Array.isArray(f.large_fires_near_people) ? f.large_fires_near_people.length : 0),
    label: 'Large fires near towns',
    wideOnly: true,
  })
  const parts: string[] = []
  if (typeof f.norm_daily_events === 'number') {
    const years = (typeof f.norm_years === 'string' ? f.norm_years : SCALE.fire.baselineYears).replace('-', '–')
    // The baseline averages the same week and the week either side (fire.baseline.smooth_weeks).
    let norm = `In ${years}, this time of year averaged ${normText(f.norm_daily_events)} fire events a day`
    if (typeof f.norm_max_daily_events === 'number') norm += `; the busiest day had ${count(f.norm_max_daily_events)}`
    parts.push(norm + '.')
  }
  const districts = Array.isArray(f.districts) ? [...f.districts].sort((a, b) => b.fire_events - a.fire_events) : []
  if (districts.length > 0) {
    const top = districts.slice(0, 3).map((d) => `${d.district} (${d.fire_events})`)
    parts.push(`Busiest districts: ${top.join(', ')}.`)
  }
  return { cells, text: parts.join(' ') || null, link: null }
}

/** A city's reading: "AQI 301" (CPCB) or "PM2.5 182 µg/m³" (OpenAQ fallback, 24 h mean). */
export function cityReading(c: AirCity): string {
  if (typeof c.aqi === 'number') return `AQI ${c.aqi}`
  if (typeof c.pm25_24h === 'number') return `PM2.5 ${Math.round(c.pm25_24h)} µg/m³`
  if (typeof c.pm10_24h === 'number') return `PM10 ${Math.round(c.pm10_24h)} µg/m³`
  return 'no reading'
}

function cityValue(c: AirCity): number {
  return c.aqi ?? c.pm25_24h ?? c.pm10_24h ?? 0
}

/** The cities worst first: by the band they count in, then by reading. */
export function worstCities(f: Figures): AirCity[] {
  if (!Array.isArray(f.cities)) return []
  return [...f.cities].sort(
    (a, b) => AIR_BANDS.indexOf(counted(a)) - AIR_BANDS.indexOf(counted(b)) || cityValue(b) - cityValue(a),
  )
}

function airCard(f: Figures): Card {
  const c = f.counts ?? {}
  const cells: Cell[] = [
    { value: count(c.severe ?? 0), label: 'Cities severe', short: 'Severe' },
    { value: count(c.very_poor ?? 0), label: 'Cities very poor', short: 'Very poor' },
    { value: count(c.poor ?? 0), label: 'Cities poor', short: 'Poor' },
  ]
  if (typeof f.cities_reporting === 'number') {
    cells.push({ value: count(f.cities_reporting), label: 'Cities reporting', wideOnly: true })
  }
  const worst = worstCities(f).slice(0, 3)
  const text =
    worst.length > 0
      ? `Worst: ${worst
          .map((x, i) => {
            const where = x.state ? `${x.city}, ${x.state}` : x.city
            const reading = cityReading(x)
            const pollutant = i === 0 && x.prominent?.length && typeof x.aqi === 'number' ? ` (${x.prominent.join(', ')})` : ''
            return `${where}, ${reading}${pollutant}`
          })
          .join('; ')}.`
      : null
  return { cells, text, link: null }
}

function quakeCard(f: Figures, sourceRef: string | null): Card {
  const cells: Cell[] = []
  if (typeof f.magnitude === 'number') {
    cells.push({ value: `M${f.magnitude.toFixed(1)}`, label: f.magnitude_type ? `Magnitude (${f.magnitude_type})` : 'Magnitude', short: 'Magnitude' })
  }
  if (typeof f.depth_km === 'number') cells.push({ value: `${Math.round(f.depth_km)} km`, label: 'Depth' })
  if (f.in_india) cells.push({ value: 'In India', label: 'Epicentre', short: 'Epicentre' })
  else if (typeof f.km_from_india === 'number') cells.push({ value: `${Math.round(f.km_from_india)} km`, label: 'From India' })
  cells.push({ value: count(f.felt_reports ?? 0), label: 'Felt reports (USGS)', wideOnly: true })
  const parts: string[] = []
  if (f.usgs_alert) parts.push(`USGS PAGER alert: ${f.usgs_alert}.`)
  if (f.tsunami) parts.push('USGS has set its tsunami flag for this quake.')
  const id = sourceRef?.replace(/^USGS-/, '')
  return {
    cells,
    text: parts.join(' ') || null,
    link: id ? { href: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, text: 'USGS event page' } : null,
  }
}

function gdacsCard(f: Figures, cyclone: boolean): Card {
  const cells: Cell[] = []
  if (f.alert_level) cells.push({ value: f.alert_level, label: 'GDACS alert', short: 'Alert' })
  if (typeof f.severity === 'number' && f.severity > 0 && f.severity_unit) {
    cells.push({
      value: `${Math.round(f.severity)} ${f.severity_unit}`,
      label: cyclone ? 'Max wind speed' : 'Severity',
      short: cyclone ? 'Max wind' : 'Severity',
    })
  }
  if (typeof f.alert_score === 'number') {
    const prev = f.prev_episode_alert_score
    const value = typeof prev === 'number' && prev !== f.alert_score ? `${prev} → ${f.alert_score}` : String(f.alert_score)
    cells.push({ value, label: 'Alert score', short: 'Score' })
  }
  if (typeof f.episode_id === 'number') cells.push({ value: String(f.episode_id), label: 'GDACS episode', wideOnly: true })
  return { cells, text: null, link: f.gdacs_url ? { href: f.gdacs_url, text: 'GDACS report' } : null }
}

/** The figures for a Level 2+ item; null for Level 1 rows and grouped quakes. */
export function entryCard(e: DeskEntry): Card | null {
  if (e.level < 2 || e.members.length > 0) return null
  const f = e.figures
  switch (e.category) {
    case 'fire':
      return fireCard(f)
    case 'air':
      return airCard(f)
    case 'earthquake':
      return quakeCard(f, e.sourceRef)
    case 'cyclone':
    case 'flood':
      return gdacsCard(f, e.category === 'cyclone')
  }
}

// --- the phone wire ---------------------------------------------------------------

export interface WireDistrict {
  district: string
  state: string
  fireEvents: number
}

/** Districts with fire activity across the edition's open fire items, busiest first. */
export function fireDistricts(snapshots: Snapshot[]): { total: number; top: WireDistrict[] } {
  const fires = snapshots.filter((s) => s.status === 'open' && s.category === 'fire')
  const all: WireDistrict[] = []
  let total = 0
  for (const s of fires) {
    const f = s.figures ?? {}
    total += typeof f.district_count === 'number' ? f.district_count : 0
    for (const d of Array.isArray(f.districts) ? f.districts : []) {
      all.push({ district: d.district, state: String(f.state ?? ''), fireEvents: d.fire_events })
    }
  }
  all.sort((a, b) => b.fireEvents - a.fireEvents || (a.district < b.district ? -1 : 1))
  return { total, top: all.slice(0, 12) }
}
