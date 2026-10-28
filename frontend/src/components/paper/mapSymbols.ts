// Hazard symbols for the paper map, as SVG strings for Leaflet's divIcons and
// the map key: a spiral for a cyclone (sized by wind), rings for an earthquake
// (sized by magnitude), waves for a flood. Fires are the day's dots, so a fire
// state shows only its badge. Ink throughout; red only at Level 3 and up, and
// a slow pulse at Level 4.

import type { Category, Level } from '@/lib/desk/types'

export const INK = '#17171B'
export const ACCENT = '#A8221B'
export const PAPER = '#F3F0E8'
export const MUTED = '#5C5A55'

/** A cyclone's spiral from its wind speed: 18 px at a tropical storm's 63 km/h, about 44 px at 225 km/h. */
export function cycloneSize(windKmh: number | null): number {
  if (windKmh === null) return 26
  return Math.round(Math.min(46, Math.max(18, 18 + (windKmh - 63) * 0.16)))
}

/** An earthquake's rings from its magnitude: 12 px at 4, 39 px at 7. */
export function quakeSize(magnitude: number | null): number {
  if (magnitude === null) return 20
  return Math.round(Math.min(46, Math.max(12, 12 + (magnitude - 4) * 9)))
}

const FLOOD_SIZE = 24

/** The symbol's size in px for a category and its strength (wind km/h, magnitude). */
export function symbolSize(category: Category, strength: number | null): number {
  if (category === 'cyclone') return cycloneSize(strength)
  if (category === 'earthquake') return quakeSize(strength)
  if (category === 'flood') return FLOOD_SIZE
  return 0
}

// Drawn in a 24-unit box; strokes are scaled so they stay about 1.7 px whatever the size.
function glyph(category: Category, colour: string): string {
  switch (category) {
    case 'cyclone':
      // The eye, and two arms leaving it and curling clockwise outward (a Northern Hemisphere cyclone).
      return `<circle cx="12" cy="12" r="1.5" fill="${colour}" stroke="none"/><circle cx="12" cy="12" r="3.6"/><path d="M8.4 12C8.4 6.2 12.4 2.6 19.4 3"/><path d="M15.6 12C15.6 17.8 11.6 21.4 4.6 21"/>`
    case 'earthquake':
      return `<circle cx="12" cy="12" r="1.9" fill="${colour}" stroke="none"/><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="10.6" stroke-opacity="0.6"/>`
    case 'flood':
      return '<path d="M2 7.5q2.5-3 5 0t5 0t5 0t5 0"/><path d="M2 12.5q2.5-3 5 0t5 0t5 0t5 0"/><path d="M2 17.5q2.5-3 5 0t5 0t5 0t5 0"/>'
    default:
      return ''
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
  const inner = glyph(category, colour)
  const dash = closed ? ` stroke-dasharray="${(2.4 * k).toFixed(2)} ${(1.8 * k).toFixed(2)}"` : ''
  const halo = `<g fill="none" stroke="${PAPER}" stroke-width="${(4.4 * k).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.9">${inner.replace(/fill="[^"]*" stroke="none"/g, 'fill="none"')}</g>`
  const ink = `<g fill="none" stroke="${colour}" stroke-width="${(1.7 * k).toFixed(2)}" stroke-linecap="round"${dash}>${inner}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block;overflow:visible">${halo}${ink}</svg>`
}

/** The rank badge: a small numbered square, red at Level 3 and up. */
export function badgeHtml(n: number, level: Level, style = ''): string {
  const bg = level >= 3 ? ACCENT : INK
  return `<span style="position:absolute;${style}min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border:1px solid ${PAPER};background:${bg};color:${PAPER};font:600 10px/14px 'IBM Plex Mono',monospace;text-align:center">${n}</span>`
}
