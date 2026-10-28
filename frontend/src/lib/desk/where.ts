// Where a point is, in plain words: "in the Bay of Bengal, about 40 km off the
// Andhra Pradesh coast". Geometry only: the nearest point of an Indian state's
// coast, India's outline for land, and coarse sea areas drawn well inside the
// water, so a point near another country's coast gets no sea name.

import geo from './geo/india-coast.json'
import { roundKm } from './words'

type LatLon = [number, number]

const OUTLINE = geo.outline as unknown as LatLon[][]

/** India's official outline, simplified to ~5 km: [lat, lon] rings, for drawing. */
export const INDIA_OUTLINE: LatLon[][] = OUTLINE
const COAST = geo.coast as unknown as Record<string, LatLon[]>

// Coarse sea areas, [lat, lon], kept inside the water: clear of Sri Lanka,
// Bangladesh, Myanmar, Pakistan and the Andaman and Nicobar chain.
const SEAS: { name: string; ring: LatLon[] }[] = [
  {
    name: 'the Bay of Bengal',
    ring: [
      [5.0, 82.0], [10.0, 82.0], [12.5, 80.4], [15.5, 80.6], [17.0, 82.6], [19.0, 85.2], [20.5, 87.0], [21.3, 88.0],
      [21.3, 91.5], [20.5, 92.0], [18.5, 93.3], [16.5, 93.9], [15.0, 93.7], [13.8, 92.6], [10.5, 92.2], [6.5, 93.4], [5.0, 94.0],
    ],
  },
  {
    name: 'the Arabian Sea',
    ring: [
      [5.0, 52.0], [11.5, 51.8], [14.0, 54.0], [16.5, 56.0], [21.5, 59.6], [23.5, 61.6], [24.6, 64.0], [24.2, 66.8],
      [23.3, 68.0], [22.2, 68.8], [20.6, 70.4], [19.5, 72.4], [17.0, 73.0], [15.5, 73.5], [13.0, 74.5], [11.0, 75.5],
      [9.0, 76.2], [8.0, 76.9], [5.0, 77.0],
    ],
  },
  {
    name: 'the Andaman Sea',
    ring: [[16.0, 94.6], [16.3, 97.2], [13.0, 98.4], [9.0, 98.1], [6.0, 97.5], [5.0, 95.2], [6.8, 94.1], [10.5, 93.1], [13.8, 93.3], [15.0, 94.2]],
  },
  { name: 'the Indian Ocean', ring: [[-10, 60], [5, 60], [5, 100], [-10, 100]] },
]

/** Ray casting on [lat, lon] rings. */
function inside([lat, lon]: LatLon, ring: LatLon[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ai, oi] = ring[i]
    const [aj, oj] = ring[j]
    if (oi > lon !== oj > lon && lat < ((aj - ai) * (lon - oi)) / (oj - oi) + ai) hit = !hit
  }
  return hit
}

function km([lat1, lon1]: LatLon, [lat2, lon2]: LatLon): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

export interface Place {
  /** "the Bay of Bengal", or null over land or near another country. */
  sea: string | null
  overLand: boolean
  /** The state whose coast is nearest. */
  coastState: string
  /** Distance to that coast, in km. */
  km: number
}

export function placeOf(lat: number, lon: number): Place {
  const p: LatLon = [lat, lon]
  let best = { state: '', km: Infinity }
  for (const [state, points] of Object.entries(COAST)) {
    for (const q of points) {
      const d = km(p, q)
      if (d < best.km) best = { state, km: d }
    }
  }
  const overLand = OUTLINE.some((ring) => inside(p, ring))
  const sea = overLand ? null : (SEAS.find((s) => inside(p, s.ring))?.name ?? null)
  return { sea, overLand, coastState: best.state, km: best.km }
}

const ISLANDS: Record<string, string> = {
  'Andaman and Nicobar Islands': 'the Andaman and Nicobar Islands',
  Lakshadweep: 'Lakshadweep',
}

/** "near the Andhra Pradesh coast", "in the Bay of Bengal, about 160 km off the Odisha coast", "over land, about 120 km from the Odisha coast" */
export function placeText(p: Place): string {
  const coast = ISLANDS[p.coastState] ?? `the ${p.coastState} coast`
  const dist = `about ${roundKm(p.km)} km`
  if (p.km < 30) return `near ${coast}`
  if (p.overLand) return `over land, ${dist} from ${coast}`
  if (!p.sea) return `${dist} from ${coast}`
  return `in ${p.sea}, ${dist} off ${coast}`
}
