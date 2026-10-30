// The evidence under each Level 2+ item: a strip of exact figures, a line of
// detail and a link to the source's own page. The story itself is in copy.ts;
// this is the measurement behind it. Only what the snapshot's figures hold, so
// past editions print the same.

import { counted, AIR_BANDS, type DeskEntry } from './entries'
import { ratioText } from './headline'
import { SCALE } from './scale'
import type { AirCity, Figures, Level, Snapshot } from './types'
import { cycloneWind } from './wind'

export interface Cell {
  value: string
  label: string
  /** Shorter label for phones. */
  short?: string
  /** Left off on phones, which show three cells. */
  wideOnly?: boolean
}

/** One row of the fire roundup's state table. */
export interface FireRow {
  key: string
  state: string
  fires: number
  /** The usual fires a day at this time of year: "3.0", "69". */
  usual: string
  /** "busiest in 2 years", "matches busiest", "within range" */
  vsPast: string
  level: Level
  wouldBe: Level | null
  lastKnown: boolean
}

export interface Card {
  cells: Cell[]
  /** The fire roundup: one row per state, and the day the counts are for ("26 Oct"). */
  table?: FireRow[]
  tableDay?: string | null
  /** One line of exact detail: busiest districts, next worst cities. */
  detail: string | null
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
    { value: count(f.fire_events), label: f.day ? `Fires on ${dayText(f.day)}` : 'Fires', short: 'Fires' },
    { value: count(f.district_count), label: 'Districts', short: 'Districts' },
  ]
  if (typeof f.ratio_to_norm === 'number') {
    const norm = typeof f.norm_daily_events === 'number' ? `Usual ${normText(f.norm_daily_events)}/day` : 'Times usual'
    cells.push({ value: `${ratioText(f.ratio_to_norm)}×`, label: norm, short: 'Times usual' })
  }
  cells.push({
    value: count(Array.isArray(f.large_fires_near_people) ? f.large_fires_near_people.length : 0),
    label: 'Large fires near towns',
    wideOnly: true,
  })
  const parts: string[] = []
  const districts = Array.isArray(f.districts) ? [...f.districts].sort((a, b) => b.fire_events - a.fire_events) : []
  if (districts.length > 0) parts.push(`Busiest districts: ${districts.slice(0, 3).map((d) => `${d.district} ${d.fire_events}`).join(', ')}`)
  if (typeof f.norm_max_daily_events === 'number') {
    // The baseline covers the same week and the week either side (fire.baseline.smooth_weeks).
    const years = (typeof f.norm_years === 'string' ? f.norm_years : SCALE.fire.baselineYears).replace('-', '–')
    parts.push(`busiest day at this time of year in ${years}: ${count(f.norm_max_daily_events)}`)
  }
  return { cells, detail: parts.join(' · ') || null, link: null }
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
  const worst = worstCities(f).slice(0, 4)
  const detail =
    worst.length > 0
      ? `Worst: ${worst
          .map((x, i) => {
            const pollutant = i === 0 && x.prominent?.length ? ` (${x.prominent.join(', ')})` : ''
            return `${x.city} ${cityReading(x)}${pollutant}`
          })
          .join(', ')}`
      : null
  return { cells, detail, link: null }
}

function quakeCard(f: Figures, sourceRef: string | null): Card {
  const cells: Cell[] = []
  if (typeof f.magnitude === 'number') {
    cells.push({ value: `M${f.magnitude.toFixed(1)}`, label: f.magnitude_type ? `Magnitude (${f.magnitude_type})` : 'Magnitude', short: 'Magnitude' })
  }
  if (typeof f.depth_km === 'number') cells.push({ value: `${Math.round(f.depth_km)} km`, label: 'Depth' })
  if (f.in_india) cells.push({ value: 'In India', label: 'Epicentre', short: 'Epicentre' })
  else if (typeof f.km_from_india === 'number') cells.push({ value: `${Math.round(f.km_from_india)} km`, label: 'Outside India' })
  cells.push({ value: count(f.felt_reports ?? 0), label: 'Felt reports', wideOnly: true })
  const parts: string[] = []
  if (f.usgs_alert) parts.push(`PAGER alert ${f.usgs_alert}`)
  if (f.tsunami) parts.push('tsunami flag set')
  const id = sourceRef?.replace(/^USGS-/, '')
  return {
    cells,
    detail: parts.join(' · ') || null,
    link: id ? { href: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, text: 'USGS event page' } : null,
  }
}

function gdacsCard(f: Figures, cyclone: boolean): Card {
  const cells: Cell[] = []
  const colour = f.episode_alert_level ?? f.alert_level
  if (colour) cells.push({ value: colour, label: 'GDACS alert', short: 'Alert' })
  if (cyclone) {
    // The latest wind (edition 32 on), and the peak when it was higher; before 32 only the peak.
    const w = cycloneWind(f)
    if (w.now !== null) cells.push({ value: `${w.now} km/h`, label: 'Latest wind', short: 'Wind' })
    if (w.peak !== null && (w.now === null || w.peak > w.now)) cells.push({ value: `${w.peak} km/h`, label: 'Peak wind', short: 'Peak' })
  } else if (typeof f.severity === 'number' && f.severity > 0 && f.severity_unit) {
    cells.push({ value: `${Math.round(f.severity)} ${f.severity_unit}`, label: 'Severity', short: 'Severity' })
  }
  return { cells, detail: null, link: f.gdacs_url ? { href: f.gdacs_url, text: 'GDACS report' } : null }
}

/** The roundup's state table: the states still at Level 2 or above, in desk order. Those that eased are named in the story. */
export function fireRows(e: DeskEntry): FireRow[] {
  return e.members.filter((m) => m.level >= 2).map((m) => {
    const f = m.figures
    const n = f.fire_events ?? 0
    const max = typeof f.norm_max_daily_events === 'number' ? f.norm_max_daily_events : null
    const [a, b] = String(f.norm_years ?? SCALE.fire.baselineYears).split(/[-–]/).map(Number)
    const years = b ? b - a + 1 : 1
    return {
      key: m.key,
      state: String(f.state ?? m.title),
      fires: n,
      usual: typeof f.norm_daily_events === 'number' ? normText(f.norm_daily_events) : '—',
      vsPast: max === null ? '—' : n > max ? `busiest in ${years} years` : n === max ? 'matches busiest' : 'within range',
      level: m.level,
      wouldBe: m.wouldBe,
      lastKnown: m.lastKnown,
    }
  })
}

/** The figures for a Level 2+ item; null for Level 1 rows and grouped quakes. */
export function entryCard(e: DeskEntry): Card | null {
  if (e.level < 2) return null
  if (e.members.length > 0) {
    if (e.category !== 'fire') return null
    const day = e.figures.day
    const rows = fireRows(e)
    return rows.length > 0 ? { cells: [], table: rows, tableDay: day ? dayText(day) : null, detail: null, link: null } : null
  }
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
