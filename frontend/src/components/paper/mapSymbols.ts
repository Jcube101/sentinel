// Hazard symbols for the paper map ("A2 · Map symbols"), as SVG/HTML strings
// for Leaflet's divIcons, the map key and /dev/symbols:
// - cyclone: a spiral, sized by wind speed; a faint halo and a slow pulse at Level 4;
// - earthquake: ripple rings, one per level, sized by magnitude;
// - flood: wave lines, one per level;
// - fire: the day's dots in ember (a fire state shows only its rank badge);
// - air: soft squares tinted by band, poor or worse, under everything else.
// Ink throughout; red only at Level 3 and up.

import type { AirBand, Category, Level } from '@/lib/desk/types'

export const INK = '#17171B'
export const ACCENT = '#A8221B'
export const PAPER = '#F3F0E8'
export const MUTED = '#5C5A55'
/** Fire dots: warm ember, so they read as fire without spending the red. */
export const EMBER = '#B4532A'

/** Fire dot colour and opacity: ember, or red in a state at Level 3 and up. */
export function fireDot(hot: boolean): { color: string; opacity: number } {
  return hot ? { color: ACCENT, opacity: 0.75 } : { color: EMBER, opacity: 0.65 }
}

/** A cyclone's spiral from its wind speed: 18 px at a tropical storm's 63 km/h, about 44 px at 225 km/h. */
export function cycloneSize(windKmh: number | null): number {
  if (windKmh === null) return 26
  return Math.round(Math.min(46, Math.max(18, 18 + (windKmh - 63) * 0.16)))
}

/** An earthquake's rings from its magnitude: 14 px at 4, 41 px at 7. */
export function quakeSize(magnitude: number | null): number {
  if (magnitude === null) return 22
  return Math.round(Math.min(48, Math.max(14, 14 + (magnitude - 4) * 9)))
}

const FLOOD_SIZE = 24

/** The symbol's size in px for a category and its strength (wind km/h, magnitude). */
export function symbolSize(category: Category, strength: number | null): number {
  if (category === 'cyclone') return cycloneSize(strength)
  if (category === 'earthquake') return quakeSize(strength)
  if (category === 'flood') return FLOOD_SIZE
  return 0
}

/** The glyph's strokes in a 24-unit box, and anything drawn under its halo. */
function glyph(category: Category, level: Level, colour: string): { under: string; lines: string } {
  switch (category) {
    case 'cyclone':
      // The eye, and two arms leaving it and curling clockwise outward (a Northern Hemisphere cyclone).
      return {
        under: level >= 4 ? `<circle cx="12" cy="12" r="12.5" fill="${ACCENT}" fill-opacity="0.12"/>` : '',
        lines:
          `<circle cx="12" cy="12" r="1.5" fill="${colour}" stroke="none"/><circle cx="12" cy="12" r="3.6"/>` +
          '<path d="M8.4 12C8.4 6.2 12.4 2.6 19.4 3"/><path d="M15.6 12C15.6 17.8 11.6 21.4 4.6 21"/>',
      }
    case 'earthquake': {
      // A ripple: the epicentre, then one ring per level, fading outward.
      const rings = Array.from({ length: level }, (_, i) => {
        const r = 2.6 + (8.6 * (i + 1)) / level
        const fade = level === 1 ? 1 : 1 - (0.5 * i) / (level - 1)
        return `<circle cx="12" cy="12" r="${r.toFixed(2)}" stroke-opacity="${fade.toFixed(2)}"/>`
      })
      return { under: '', lines: `<circle cx="12" cy="12" r="1.7" fill="${colour}" stroke="none"/>${rings.join('')}` }
    }
    case 'flood': {
      // One wave line per level, centred.
      const waves = Array.from({ length: level }, (_, i) => {
        const y = 12 + (i - (level - 1) / 2) * 5 + 1.2
        return `<path d="M2 ${y.toFixed(1)}q2.5-3 5 0t5 0t5 0t5 0"/>`
      })
      return { under: '', lines: waves.join('') }
    }
    default:
      return { under: '', lines: '' }
  }
}

export interface SymbolStyle {
  category: Category
  size: number
  level: Level
  closed?: boolean
}

/** The symbol as an <svg> string: an ink (or red) glyph over a paper halo, so it reads over tiles and fire dots. */
export function symbolSvg({ category, size, level, closed = false }: SymbolStyle): string {
  const colour = closed ? MUTED : level >= 3 ? ACCENT : INK
  const k = 24 / size
  const { under, lines } = glyph(category, level, colour)
  const strokeW = category === 'earthquake' ? 1.4 : 1.7
  const dash = closed ? ` stroke-dasharray="${(2.4 * k).toFixed(2)} ${(1.8 * k).toFixed(2)}"` : ''
  const halo = `<g fill="none" stroke="${PAPER}" stroke-width="${((strokeW + 2.6) * k).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.9">${lines.replace(/fill="[^"]*" stroke="none"/g, 'fill="none"')}</g>`
  const ink = `<g fill="none" stroke="${colour}" stroke-width="${(strokeW * k).toFixed(2)}" stroke-linecap="round"${dash}>${lines}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block;overflow:visible">${closed ? '' : under}${halo}${ink}</svg>`
}

/** The rank badge: a small numbered square, red at Level 3 and up. */
export function badgeHtml(n: number, level: Level, style = ''): string {
  const bg = level >= 3 ? ACCENT : INK
  return `<span style="position:absolute;${style}min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border:1px solid ${PAPER};background:${bg};color:${PAPER};font:600 10px/14px 'IBM Plex Mono',monospace;text-align:center">${n}</span>`
}

export interface MarkerSpec {
  category: Category
  /** A cyclone's wind in km/h, a quake's magnitude; else null. */
  strength: number | null
  level: Level
  /** The rank badge; null for closed items. */
  number: number | null
  closed: boolean
}

/**
 * An item's marker as HTML, and its box size: the hazard symbol with the rank
 * badge on its shoulder. A fire state has no symbol of its own (its fires are
 * the dots), so it is the badge alone. Closed items are dashed and unnumbered.
 */
export function markerHtml(m: MarkerSpec, selected: boolean, scale = 1): { html: string; size: number } {
  const size = Math.round(symbolSize(m.category, m.strength) * scale)
  if (size === 0) {
    if (m.number === null) {
      return { html: `<div style="width:8px;height:8px;border:1px dashed ${INK};background:${PAPER};box-sizing:border-box"></div>`, size: 8 }
    }
    const ring = selected ? `box-shadow:0 0 0 2px ${PAPER},0 0 0 3.5px ${ACCENT};` : ''
    return { html: `<div style="position:relative;width:16px;height:16px;${ring}">${badgeHtml(m.number, m.level, 'left:0;top:0;')}</div>`, size: 16 }
  }
  const pulse = m.level >= 4 && !m.closed ? `<span class="map-pulse" style="border-color:${ACCENT}"></span>` : ''
  const ring = selected ? `<span style="position:absolute;inset:-5px;border-radius:50%;background:${PAPER}cc;box-shadow:0 0 0 1.5px ${ACCENT}"></span>` : ''
  const badge = m.number === null ? '' : badgeHtml(m.number, m.level, `left:${Math.round(size * 0.68)}px;top:-8px;`)
  const svg = symbolSvg({ category: m.category, size, level: m.level, closed: m.closed })
  return {
    html: `<div style="position:relative;width:${size}px;height:${size}px">${pulse}${ring}<span style="position:relative">${svg}</span>${badge}</div>`,
    size,
  }
}

// --- air ---------------------------------------------------------------------------

/**
 * Air squares, soft and tinted by band: a cool haze, so they don't read as
 * fire, and red only for Severe (which is Level 3).
 */
export const AIR_TINT: Record<AirBand, { color: string; opacity: number }> = {
  poor: { color: '#7F97AB', opacity: 0.55 },
  very_poor: { color: '#3F5568', opacity: 0.55 },
  severe: { color: ACCENT, opacity: 0.55 },
}

/** One city on the air layer. Filled from the air figures once they carry positions (plan P5). */
export interface AirPoint {
  city: string
  lat: number
  lon: number
  band: AirBand
  /** "412", "PM2.5 182 µg/m³" */
  reading: string
}

/** A city's square, 11 px (13 for Severe), and the worst city's label beside it. */
export function airSquareHtml(p: AirPoint, label: boolean): { html: string; size: number } {
  const size = p.band === 'severe' ? 13 : 11
  const t = AIR_TINT[p.band]
  const text = label
    ? `<span style="position:absolute;left:${size + 4}px;top:50%;transform:translateY(-50%);white-space:nowrap;font:600 10px 'IBM Plex Mono',monospace;color:${INK};text-shadow:0 0 2px ${PAPER},0 0 2px ${PAPER},0 0 3px ${PAPER}">${p.city} ${p.reading}</span>`
    : ''
  const alpha = Math.round(t.opacity * 255)
    .toString(16)
    .padStart(2, '0')
  return {
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:1.5px;background:${t.color}${alpha}">${text}</div>`,
    size,
  }
}
