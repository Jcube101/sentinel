import type { NaturalEvent } from './types'

// Weights for blending category-normalized severity with recency. Named
// consts so the mix is tunable without hunting through the formula.
const BASE_WEIGHT = 0.75
const RECENCY_WEIGHT = 0.25
const RECENCY_WINDOW_HOURS = 72

const EQ_MIN_MAGNITUDE = 3
const EQ_MAX_MAGNITUDE = 8

// Every fetcher (FIRMS, USGS, GDACS, EONET) already writes a normalized
// `severity` label onto the row — reuse it as the base bucket for any
// category where a more specific numeric read isn't available.
const LABEL_SCORE: Record<string, number> = {
  low: 25,
  medium: 50,
  high: 75,
  extreme: 100,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function baseScore(event: NaturalEvent): number {
  if (event.category === 'earthquake' && event.severity_value != null) {
    const pct = (event.severity_value - EQ_MIN_MAGNITUDE) / (EQ_MAX_MAGNITUDE - EQ_MIN_MAGNITUDE)
    return clamp(pct * 100, 0, 100)
  }

  const label = event.severity?.toLowerCase()
  return label && label in LABEL_SCORE ? LABEL_SCORE[label] : 50
}

function recencyBoost(event: NaturalEvent): number {
  const ageHours = (Date.now() - new Date(event.started_at).getTime()) / (1000 * 60 * 60)
  return clamp(100 - (ageHours / RECENCY_WINDOW_HOURS) * 100, 0, 100)
}

export function severityScore(event: NaturalEvent): number {
  const score = BASE_WEIGHT * baseScore(event) + RECENCY_WEIGHT * recencyBoost(event)
  return Math.round(clamp(score, 0, 100))
}

export function severityBucket(score: number): 'low' | 'mid' | 'high' {
  if (score < 34) return 'low'
  if (score < 67) return 'mid'
  return 'high'
}

// Mirrors the --sev-* CSS custom properties. Exported as hex so components
// can compose translucent chip backgrounds (Tailwind can't apply opacity
// modifiers to colors sourced from CSS variables).
export const SEVERITY_COLORS: Record<'low' | 'mid' | 'high', string> = {
  low: '#22c55e',
  mid: '#f59e0b',
  high: '#ef4444',
}
