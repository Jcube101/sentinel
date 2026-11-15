// The level rules (pipeline/severity.toml), per edition.
//
// Each edition stores the thresholds it ran with (pipeline_runs.severity_config,
// plan P3; editions 1-28 backfilled from git history). scaleFrom() reads them;
// SCALE is the current rules, used when an edition has none and on pages with
// no edition. The rules have changed twice: fire went from 1.25x/2x to 2x/4x
// with edition 3, and air gained the AQI bands and the two-reports rule for
// severe with edition 9.

interface Bands {
  poorAbove: number
  veryPoorAbove: number
  severeAbove: number
}

export interface Scale {
  /** The first edition with a severity desk (not a level rule). */
  fromEdition: number
  quake: {
    level2MinMagnitude: number
    level3MinMagnitude: number
    level4MinMagnitude: number
    indiaBufferKm: number
    anywhereMinMagnitude: number
    /** Not a level rule: the USGS fetch's minimum magnitude (fetchers/usgs.py), for "none of magnitude 4 or more". */
    fetchMinMagnitude: number
  }
  /** The level each GDACS alert colour sets. */
  gdacs: { green: number; greenRising: number; orange: number; red: number }
  air: {
    level3MinSevereCities: number
    level4MinSevereCities: number
    /** Reports in a row before a city counts as severe; null before the rule existed (editions 1-8). */
    severeConfirmRuns: number | null
    /** CPCB AQI bands; null before the CPCB feed (editions 1-8). */
    aqi: Bands | null
    pm25: Bands
    pm10: Bands
  }
  fire: {
    level2MinRatio: number
    level3MinRatio: number
    minFireEvents: number
    gdacsWildfireLevel: number
    level4MinFrpMw: number
    level4NearKm: number
    level4MinPopulation: number
    /** The highest level a state's fire count can set for now; null when uncapped (editions 1-2, or no cap). The old single calibration_cap in earlier editions' configs. */
    ratioLevelCap: number | null
    /** The highest level a large fire near a town can set for now (Level 4 when uncapped); null when uncapped. */
    nearPeopleCap: number | null
    /** Hotspots a large fire needs to count as Level 4 (1 before 15 Nov 2026). */
    level4MinHotspots: number
    baselineYears: string
  }
}

/** The rules before the 15 Nov 2026 changes: the fallback for fixtures and for an edition without a stored config. Real editions read their own config (scaleFrom). */
export const SCALE = {
  fromEdition: 2,
  quake: {
    level2MinMagnitude: 5.0,
    level3MinMagnitude: 6.0,
    level4MinMagnitude: 7.0,
    indiaBufferKm: 100,
    anywhereMinMagnitude: 6.0,
    fetchMinMagnitude: 4.0,
  },
  gdacs: { green: 1, greenRising: 2, orange: 3, red: 4 },
  air: {
    level3MinSevereCities: 1,
    level4MinSevereCities: 3,
    severeConfirmRuns: 2,
    aqi: { poorAbove: 200, veryPoorAbove: 300, severeAbove: 400 },
    pm25: { poorAbove: 90, veryPoorAbove: 120, severeAbove: 250 },
    pm10: { poorAbove: 250, veryPoorAbove: 350, severeAbove: 430 },
  },
  fire: {
    level2MinRatio: 2.0,
    level3MinRatio: 4.0,
    minFireEvents: 25,
    gdacsWildfireLevel: 3,
    level4MinFrpMw: 100,
    level4NearKm: 10,
    level4MinPopulation: 100_000,
    ratioLevelCap: 2,
    nearPeopleCap: 2,
    level4MinHotspots: 1,
    baselineYears: '2024–2025',
  },
} satisfies Scale

type Obj = Record<string, unknown>

function capOf(f: Obj, key: string): number | null {
  const v = typeof f[key] === 'number' ? f[key] : f.calibration_cap
  return typeof v === 'number' && v < 4 ? v : null
}

function obj(v: unknown): Obj | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null
}

function num(o: Obj | null, key: string, fallback: number): number {
  const v = o?.[key]
  return typeof v === 'number' ? v : fallback
}

function bands(o: Obj | null, fallback: Bands): Bands {
  return {
    poorAbove: num(o, 'poor_above', fallback.poorAbove),
    veryPoorAbove: num(o, 'very_poor_above', fallback.veryPoorAbove),
    severeAbove: num(o, 'severe_above', fallback.severeAbove),
  }
}

/**
 * An edition's scale from its stored severity_config. Without one (an
 * edition from before P3 that wasn't backfilled, or a test fixture), the
 * current rules. A rule the stored config doesn't have is one the edition
 * ran without (null), not the current value.
 */
export function scaleFrom(config: unknown): Scale {
  const c = obj(config)
  if (!c) return SCALE
  const q = obj(c.quake)
  const g = obj(c.gdacs)
  const a = obj(c.air)
  const f = obj(c.fire)
  const years = obj(f?.baseline)?.years
  return {
    fromEdition: SCALE.fromEdition,
    quake: {
      level2MinMagnitude: num(q, 'level_2_min_magnitude', SCALE.quake.level2MinMagnitude),
      level3MinMagnitude: num(q, 'level_3_min_magnitude', SCALE.quake.level3MinMagnitude),
      level4MinMagnitude: num(q, 'level_4_min_magnitude', SCALE.quake.level4MinMagnitude),
      indiaBufferKm: num(q, 'india_buffer_km', SCALE.quake.indiaBufferKm),
      anywhereMinMagnitude: num(q, 'anywhere_min_magnitude', SCALE.quake.anywhereMinMagnitude),
      fetchMinMagnitude: SCALE.quake.fetchMinMagnitude,
    },
    gdacs: {
      green: num(g, 'green', SCALE.gdacs.green),
      greenRising: num(g, 'green_rising', SCALE.gdacs.greenRising),
      orange: num(g, 'orange', SCALE.gdacs.orange),
      red: num(g, 'red', SCALE.gdacs.red),
    },
    air: {
      level3MinSevereCities: num(a, 'level_3_min_severe_cities', SCALE.air.level3MinSevereCities),
      level4MinSevereCities: num(a, 'level_4_min_severe_cities', SCALE.air.level4MinSevereCities),
      severeConfirmRuns: a ? (typeof a.severe_confirm_runs === 'number' ? a.severe_confirm_runs : null) : SCALE.air.severeConfirmRuns,
      aqi: a ? (obj(a.aqi) ? bands(obj(a.aqi), SCALE.air.aqi) : null) : SCALE.air.aqi,
      pm25: bands(obj(a?.pm25), SCALE.air.pm25),
      pm10: bands(obj(a?.pm10), SCALE.air.pm10),
    },
    fire: {
      level2MinRatio: num(f, 'level_2_min_ratio', SCALE.fire.level2MinRatio),
      level3MinRatio: num(f, 'level_3_min_ratio', SCALE.fire.level3MinRatio),
      minFireEvents: num(f, 'min_fire_events', SCALE.fire.minFireEvents),
      gdacsWildfireLevel: num(f, 'gdacs_wildfire_level', SCALE.fire.gdacsWildfireLevel),
      level4MinFrpMw: num(f, 'level_4_min_frp_mw', SCALE.fire.level4MinFrpMw),
      level4NearKm: num(f, 'level_4_near_km', SCALE.fire.level4NearKm),
      level4MinPopulation: num(f, 'level_4_min_population', SCALE.fire.level4MinPopulation),
      // 15 Nov 2026 split calibration_cap in two; earlier editions' configs only have the old one.
      ratioLevelCap: f ? capOf(f, 'ratio_level_cap') : SCALE.fire.ratioLevelCap,
      nearPeopleCap: f ? capOf(f, 'near_people_cap') : SCALE.fire.nearPeopleCap,
      level4MinHotspots: num(f, 'level_4_min_hotspots', 1),
      baselineYears:
        Array.isArray(years) && years.length > 0 && years.every((y) => typeof y === 'number')
          ? years.length === 1
            ? String(years[0])
            : `${years[0]}–${years[years.length - 1]}`
          : SCALE.fire.baselineYears,
    },
  }
}

/** The fewest fires a day that can be compared with the usual: the item's own figure, else the edition's rule. */
export function minFireEvents(f: { min_fire_events?: unknown }, s: Scale): number {
  return typeof f.min_fire_events === 'number' ? f.min_fire_events : s.fire.minFireEvents
}

/** A magnitude without a needless .0: 5, 5.9. */
export function mag(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1)
}

/** A ratio without a needless .0: 2, 1.25. */
function ratio(r: number): string {
  return String(Number(r.toFixed(2)))
}

const ALERTS: [keyof Scale['gdacs'], string][] = [
  ['green', 'green alert'],
  ['greenRising', 'green, rising'],
  ['orange', 'orange'],
  ['red', 'red'],
]

/** One row per category: what each level means under a scale (the levels table). */
export function scaleRows(s: Scale): { name: string; cells: [string, string, string, string] }[] {
  const gdacs = [1, 2, 3, 4].map((l) => ALERTS.filter(([k]) => s.gdacs[k] === l).map(([, words]) => words).join(' or ') || '—')
  const q = s.quake
  const f = s.fire
  const a = s.air
  return [
    { name: 'Flood Cyclone', cells: gdacs as [string, string, string, string] },
    {
      name: 'Quake',
      cells: [
        `under ${mag(q.level2MinMagnitude)}`,
        `${mag(q.level2MinMagnitude)}–${mag(q.level3MinMagnitude - 0.1)}`,
        `${mag(q.level3MinMagnitude)}–${mag(q.level4MinMagnitude - 0.1)}`,
        `${mag(q.level4MinMagnitude)} and over`,
      ],
    },
    {
      name: 'Air',
      cells: [
        'poor',
        'very poor',
        `severe, ${a.level3MinSevereCities} ${a.level3MinSevereCities === 1 ? 'city' : 'cities'}`,
        `severe, ${a.level4MinSevereCities}+ cities`,
      ],
    },
    {
      name: 'Fire',
      cells: [
        `under ${ratio(f.level2MinRatio)} times usual`,
        `${ratio(f.level2MinRatio)}–${ratio(f.level3MinRatio)} times usual`,
        `${ratio(f.level3MinRatio)}+ times usual, or a forest-fire alert`,
        'a large fire near a town',
      ],
    },
  ]
}

/** The current rules' rows. */
export const SCALE_ROWS = scaleRows(SCALE)
