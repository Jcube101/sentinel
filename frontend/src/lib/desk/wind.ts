// A cyclone's wind. From edition 32 the pipeline stores the latest advisory's wind
// (wind_kmh) next to the storm's peak (peak_wind_kmh). Before that the only figure is
// GDACS's `severity`, which is the peak, not the wind now (ARNAB-26 printed 222 km/h two
// days after it crossed the coast at 102 km/h).

import type { Figures } from './types'

export interface CycloneWind {
  /** The latest advisory's wind, km/h; null before edition 32 or when the run had no track. */
  now: number | null
  /** The storm's peak so far, km/h: peak_wind_kmh, else GDACS's severity. */
  peak: number | null
}

function kmh(x: unknown): number | null {
  return typeof x === 'number' && x > 0 ? Math.round(x) : null
}

export function cycloneWind(f: Figures): CycloneWind {
  return {
    now: kmh(f.wind_kmh),
    peak: kmh(f.peak_wind_kmh) ?? (f.severity_unit === 'km/h' ? kmh(f.severity) : null),
  }
}

/** The storm has weakened: its latest wind is below its peak. */
export function weakened(w: CycloneWind): boolean {
  return w.now !== null && w.peak !== null && w.now < w.peak
}
