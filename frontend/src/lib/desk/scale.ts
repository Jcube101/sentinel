// A copy of the level rules in pipeline/severity.toml.
//
// The pipeline will store the scale each edition ran with (plan P3). Until
// then the site uses this copy. The rules below haven't changed since the
// desk started: quake, GDACS and air since edition 2, fire since edition 3.
// If severity.toml's level rules change before P3 lands, add a version here
// with the first edition it applies to, rather than editing this one.

export const SCALE = {
  fromEdition: 2,
  quake: {
    level2MinMagnitude: 5.0,
    level3MinMagnitude: 6.0,
    level4MinMagnitude: 7.0,
    indiaBufferKm: 100,
    anywhereMinMagnitude: 6.0,
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
    calibrationCap: 2,
    baselineYears: '2024–2025',
  },
} as const

/** A magnitude without a needless .0: 5, 5.9. */
export function mag(m: number): string {
  return Number.isInteger(m) ? String(m) : m.toFixed(1)
}

/** One row per category: what each level means, from SCALE above. */
export const SCALE_ROWS: { name: string; cells: [string, string, string, string] }[] = [
  { name: 'Flood Cyclone', cells: ['green alert', 'green, rising', 'orange', 'red'] },
  {
    name: 'Quake',
    cells: [
      `under ${mag(SCALE.quake.level2MinMagnitude)}`,
      `${mag(SCALE.quake.level2MinMagnitude)}–${mag(SCALE.quake.level3MinMagnitude - 0.1)}`,
      `${mag(SCALE.quake.level3MinMagnitude)}–${mag(SCALE.quake.level4MinMagnitude - 0.1)}`,
      `${mag(SCALE.quake.level4MinMagnitude)} and over`,
    ],
  },
  {
    name: 'Air',
    cells: [
      'poor',
      'very poor',
      `severe, ${SCALE.air.level3MinSevereCities} ${SCALE.air.level3MinSevereCities === 1 ? 'city' : 'cities'}`,
      `severe, ${SCALE.air.level4MinSevereCities}+ cities`,
    ],
  },
  {
    name: 'Fire',
    cells: [
      `under ${SCALE.fire.level2MinRatio} times usual`,
      `${SCALE.fire.level2MinRatio}–${SCALE.fire.level3MinRatio} times usual`,
      `${SCALE.fire.level3MinRatio}+ times usual, or a forest-fire alert`,
      'a large fire near a town',
    ],
  },
]
