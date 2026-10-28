// Hazard symbols for the paper map, after docs/design/MapSymbols.dc.html ("A2 ·
// Map symbols"), as SVG/HTML strings for Leaflet's divIcons, the map key and
// /dev/symbols. Ink for Levels 1–2, red from Level 3; size carries strength.
// - cyclone: a spiral sized by wind speed; a faint halo and a slow pulse at Level 4;
// - earthquake: ripples, one ring more than the level (2 to 5), so rings track magnitude;
// - flood: wave lines, one per level, in flood blue below Level 3; a faint halo at Level 4;
// - fire: the day's dots in ember, stronger above normal, red from Level 3; the
//   state's rank badge at the centre of its fires; a ring round a large fire near a town;
// - air: a soft square per city at poor or worse, tinted by band, under everything,
//   only the worst city named (slate-blue tints, Job's choice over the sheet's ochre).

import type { AirBand, Category, Level } from '@/lib/desk/types'

export const INK = '#17171B'
export const ACCENT = '#A8221B'
export const PAPER = '#F3F0E8'
export const MUTED = '#5C5A55'
/** Fire dots: warm ember, so they read as fire without spending the red. */
export const EMBER = '#B4532A'
/** Floods below Level 3. */
export const FLOOD_BLUE = '#1F4E8C'

/** Fire dots by their state's level: ember at or near normal, stronger above it, red from Level 3. */
export function fireDot(level: Level | 0): { color: string; opacity: number } {
  if (level >= 3) return { color: ACCENT, opacity: 0.8 }
  return { color: EMBER, opacity: level === 2 ? 0.75 : 0.55 }
}

/** A cyclone's spiral from its wind speed: 18 px at a tropical storm's 63 km/h, about 44 px at 225 km/h. */
export function cycloneSize(windKmh: number | null): number {
  if (windKmh === null) return 26
  return Math.round(Math.min(46, Math.max(18, 18 + (windKmh - 63) * 0.16)))
}

/** An earthquake's outer ring, in px: rings 5 px apart from 6 px, one more than the level. */
function quakeRadius(level: Level): number {
  return 6 + 5 * level
}

/** Flood waves: half-wave width by level (the sheet widens Levels 3 and 4). */
function floodHalfWave(level: Level): number {
  return [5, 5, 6, 7][level - 1]
}

/** The symbol's natural size in px: by wind for cyclones, by level for quakes and floods; 0 for fire and air. */
export function symbolSize(category: Category, strength: number | null, level: Level): number {
  if (category === 'cyclone') return cycloneSize(strength)
  if (category === 'earthquake') return 2 * quakeRadius(level) + 4
  if (category === 'flood') return 4 * floodHalfWave(level) + 8
  return 0
}

// Ring opacities, inner to outer, as on the sheet.
const RIPPLE: Record<Level, number[]> = {
  1: [1, 0.45],
  2: [1, 0.6, 0.3],
  3: [1, 0.7, 0.45, 0.2],
  4: [1, 0.8, 0.55, 0.3, 0.15],
}

interface Glyph {
  /** The viewBox's side, in the glyph's own units. */
  box: number
  /** Drawn first, without the paper halo (the Level 4 tints). */
  under: string
  /** Stroked twice: a paper halo, then the colour. Filled shapes say fill="…" stroke="none". */
  lines: string
  /** Stroke width in px, whatever size the symbol is drawn at. */
  stroke: number
}

function glyph(category: Category, level: Level, colour: string): Glyph {
  switch (category) {
    case 'cyclone':
      // The eye, and two arms leaving it and curling clockwise outward (Job: keep this spiral).
      return {
        box: 24,
        under: level >= 4 ? `<circle cx="12" cy="12" r="10.5" fill="${ACCENT}" fill-opacity="0.08"/>` : '',
        lines:
          `<circle cx="12" cy="12" r="1.5" fill="${colour}" stroke="none"/><circle cx="12" cy="12" r="3.6"/>` +
          '<path d="M8.4 12C8.4 6.2 12.4 2.6 19.4 3"/><path d="M15.6 12C15.6 17.8 11.6 21.4 4.6 21"/>',
        stroke: 1.7,
      }
    case 'earthquake': {
      // In px: the epicentre, then rings 5 px apart, fading outward.
      const box = 2 * quakeRadius(level) + 4
      const c = box / 2
      const rings = RIPPLE[level].map((o, i) => `<circle cx="${c}" cy="${c}" r="${6 + 5 * i}" stroke-opacity="${o}"/>`)
      return {
        box,
        under: '',
        lines: `<circle cx="${c}" cy="${c}" r="${(1.6 + 0.3 * level).toFixed(1)}" fill="${colour}" stroke="none"/>${rings.join('')}`,
        stroke: level >= 3 ? 1.4 : 1.2,
      }
    }
    case 'flood': {
      // In px: one wave line per level, two full waves wide, about 1.1 half-waves apart.
      const h = floodHalfWave(level)
      const box = 4 * h + 8
      const gap = 1.1 * h
      const top = box / 2 - ((level - 1) * gap) / 2 + h * 0.2
      const waves = Array.from({ length: level }, (_, i) => {
        const y = top + i * gap
        return `<path d="M4 ${y.toFixed(1)}q${h / 2} ${(-0.66 * h).toFixed(1)} ${h} 0t${h} 0t${h} 0t${h} 0"/>`
      })
      const pad = 3
      const height = (level - 1) * gap + h * 0.66 + 2 * pad
      const under =
        level >= 4
          ? `<rect x="1" y="${(box / 2 - height / 2).toFixed(1)}" width="${box - 2}" height="${height.toFixed(1)}" fill="${ACCENT}" fill-opacity="0.08"/>`
          : ''
      return { box, under, lines: waves.join(''), stroke: 1.8 }
    }
    default:
      return { box: 24, under: '', lines: '', stroke: 1.7 }
  }
}

export interface SymbolStyle {
  category: Category
  size: number
  level: Level
  closed?: boolean
}

/** The colour a symbol is drawn in: red from Level 3; below it ink, or blue for floods; muted when closed. */
export function symbolColour(category: Category, level: Level, closed = false): string {
  if (closed) return MUTED
  if (level >= 3) return ACCENT
  return category === 'flood' ? FLOOD_BLUE : INK
}

/** The symbol as an <svg> string: the glyph over a paper halo, so it reads over tiles and fire dots. */
export function symbolSvg({ category, size, level, closed = false }: SymbolStyle): string {
  const colour = symbolColour(category, level, closed)
  const g = glyph(category, level, colour)
  const k = g.box / size // viewBox units per px: keeps strokes the same width at any size
  const dash = closed ? ` stroke-dasharray="${(2.4 * k).toFixed(2)} ${(1.8 * k).toFixed(2)}"` : ''
  const halo = `<g fill="none" stroke="${PAPER}" stroke-width="${((g.stroke + 2.6) * k).toFixed(2)}" stroke-linecap="round" stroke-opacity="0.9">${g.lines.replace(/fill="[^"]*" stroke="none"/g, 'fill="none"')}</g>`
  const ink = `<g fill="none" stroke="${colour}" stroke-width="${(g.stroke * k).toFixed(2)}" stroke-linecap="round"${dash}>${g.lines}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${g.box} ${g.box}" aria-hidden="true" style="display:block;overflow:visible">${closed ? '' : g.under}${halo}${ink}</svg>`
}

/** The rank badge: a small numbered square, red at Level 3 and up. */
export function badgeHtml(n: number, level: Level, style = ''): string {
  const bg = level >= 3 ? ACCENT : INK
  return `<span style="position:absolute;${style}min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border:1px solid ${PAPER};background:${bg};color:${PAPER};font:600 10px/14px 'IBM Plex Mono',monospace;text-align:center">${n}</span>`
}

export interface MarkerSpec {
  category: Category
  /** A cyclone's wind in km/h; else null. */
  strength: number | null
  level: Level
  /** The rank badge; null for none (closed items, and a quake group's smaller quakes). */
  number: number | null
  closed: boolean
}

/** Where a marker's badge sits, relative to the symbol's top-left corner. */
function badgeOffset(size: number): { left: number; top: number } {
  return { left: Math.round(size * 0.68), top: -8 }
}

/**
 * An item's marker as HTML, and its box size: the hazard symbol with the rank
 * badge on its shoulder. A fire state has no symbol of its own (its fires are
 * the dots), so it is the badge alone. Closed items are dashed and unnumbered.
 */
export function markerHtml(m: MarkerSpec, selected: boolean, scale = 1): { html: string; size: number } {
  const size = Math.round(symbolSize(m.category, m.strength, m.level) * scale)
  if (size === 0) {
    if (m.number === null) {
      // A closed fire state: a small dashed square. An open one without a number has no marker.
      return m.closed
        ? { html: `<div style="width:8px;height:8px;border:1px dashed ${INK};background:${PAPER};box-sizing:border-box"></div>`, size: 8 }
        : { html: '', size: 0 }
    }
    const ring = selected ? `box-shadow:0 0 0 2px ${PAPER},0 0 0 3.5px ${ACCENT};` : ''
    return { html: `<div style="position:relative;width:16px;height:16px;${ring}">${badgeHtml(m.number, m.level, 'left:0;top:0;')}</div>`, size: 16 }
  }
  const pulse = m.level >= 4 && !m.closed ? `<span class="map-pulse" style="border-color:${ACCENT}"></span>` : ''
  const ring = selected ? `<span style="position:absolute;inset:-5px;border-radius:50%;background:${PAPER}cc;box-shadow:0 0 0 1.5px ${ACCENT}"></span>` : ''
  const b = badgeOffset(size)
  const badge = m.number === null ? '' : badgeHtml(m.number, m.level, `left:${b.left}px;top:${b.top}px;`)
  const svg = symbolSvg({ category: m.category, size, level: m.level, closed: m.closed })
  return {
    html: `<div style="position:relative;width:${size}px;height:${size}px">${pulse}${ring}<span style="position:relative">${svg}</span>${badge}</div>`,
    size,
  }
}

// --- keeping labels clear of markers --------------------------------------------------

/** A box in map pixels: top-left corner, width, height. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The boxes a marker covers when drawn centred on `at`: its symbol (or badge alone) and its badge. */
export function markerBoxes(m: MarkerSpec, at: { x: number; y: number }, scale = 1): Box[] {
  const size = Math.round(symbolSize(m.category, m.strength, m.level) * scale)
  if (size === 0) {
    const s = m.number !== null ? 16 : m.closed ? 8 : 0
    return s === 0 ? [] : [{ x: at.x - s / 2, y: at.y - s / 2, w: s, h: s }]
  }
  const boxes = [{ x: at.x - size / 2, y: at.y - size / 2, w: size, h: size }]
  if (m.number !== null) {
    const b = badgeOffset(size)
    boxes.push({ x: at.x - size / 2 + b.left, y: at.y - size / 2 + b.top, w: 16 + (m.number >= 10 ? 6 : 0), h: 16 })
  }
  return boxes
}

function overlaps(a: Box, b: Box, pad = 2): boolean {
  return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
}

export type LabelSide = 'left' | 'right' | 'above' | 'below'

/** The label's box on one side of a square of side `square` centred on `at`. */
function labelBox(side: LabelSide, at: { x: number; y: number }, square: number, w: number, h: number): Box {
  switch (side) {
    case 'left':
      return { x: at.x - square / 2 - 4 - w, y: at.y - h / 2, w, h }
    case 'right':
      return { x: at.x + square / 2 + 4, y: at.y - h / 2, w, h }
    case 'above':
      return { x: at.x - w / 2, y: at.y - square / 2 - 3 - h, w, h }
    case 'below':
      return { x: at.x - w / 2, y: at.y + square / 2 + 3, w, h }
  }
}

/**
 * Where a label fits without touching any obstacle: left of its square (the
 * sheet's place), else right, above or below; null to drop it.
 */
export function placeLabel(at: { x: number; y: number }, square: number, w: number, h: number, obstacles: Box[]): LabelSide | null {
  for (const side of ['left', 'right', 'above', 'below'] as LabelSide[]) {
    const box = labelBox(side, at, square, w, h)
    if (!obstacles.some((o) => overlaps(box, o))) return side
  }
  return null
}

// --- air ---------------------------------------------------------------------------

/**
 * Air squares, soft and tinted by band: a cool haze, so they don't read as
 * fire (Job kept these over the sheet's ochre), and red only for Severe,
 * which is Level 3. Sizes grow with the band, as on the sheet.
 */
export const AIR_TINT: Record<AirBand, { color: string; opacity: number; size: number }> = {
  poor: { color: '#7F97AB', opacity: 0.7, size: 9 },
  very_poor: { color: '#3F5568', opacity: 0.7, size: 10 },
  severe: { color: ACCENT, opacity: 0.7, size: 11 },
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

export const AIR_LABEL = { font: 9.5, charWidth: 5.8, height: 12 }

/** The label text and its rough width in px (IBM Plex Mono is 0.6 em a character). */
export function airLabel(p: AirPoint): { text: string; w: number } {
  const text = `${p.city} ${p.reading}`
  return { text, w: Math.ceil(text.length * AIR_LABEL.charWidth) + 2 }
}

/** A city's square, and the worst city's label on the side that is clear (null: no label). */
export function airSquareHtml(p: AirPoint, side: LabelSide | null): { html: string; size: number } {
  const t = AIR_TINT[p.band]
  const size = t.size
  const alpha = Math.round(t.opacity * 255)
    .toString(16)
    .padStart(2, '0')
  let text = ''
  if (side) {
    const { text: words, w } = airLabel(p)
    const box = labelBox(side, { x: size / 2, y: size / 2 }, size, w, AIR_LABEL.height)
    text =
      `<span style="position:absolute;left:${box.x}px;top:${box.y}px;width:${w}px;height:${AIR_LABEL.height}px;` +
      `text-align:${side === 'left' ? 'right' : side === 'right' ? 'left' : 'center'};white-space:nowrap;` +
      `font:500 ${AIR_LABEL.font}px/${AIR_LABEL.height}px 'IBM Plex Mono',monospace;color:${INK};` +
      `text-shadow:0 0 2px ${PAPER},0 0 2px ${PAPER},0 0 3px ${PAPER}">${words}</span>`
  }
  return {
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:2px;background:${t.color}${alpha}">${text}</div>`,
    size,
  }
}
