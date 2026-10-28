import { describe, expect, it } from 'vitest'
import { ACCENT, EMBER, FLOOD_BLUE, INK, cycloneSize, fireDot, markerBoxes, markerHtml, placeLabel, symbolSize, symbolSvg } from './mapSymbols'
import type { Level } from '@/lib/desk/types'

// docs/design/MapSymbols.dc.html, as the map draws it (/dev/symbols shows it all).
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length / 2 // halo + ink draw each line once

describe('map symbols', () => {
  it('earthquake: ripples, one ring more than the level, 5 px apart', () => {
    const rings = ([1, 2, 3, 4] as Level[]).map((level) => count(symbolSvg({ category: 'earthquake', size: 30, level }), /<circle[^>]*stroke-opacity/g))
    expect(rings).toEqual([2, 3, 4, 5])
    expect(([1, 2, 3, 4] as Level[]).map((l) => symbolSize('earthquake', null, l))).toEqual([26, 36, 46, 56])
  })

  it('flood: one wave line per level', () => {
    const waves = ([1, 2, 3, 4] as Level[]).map((level) => count(symbolSvg({ category: 'flood', size: 24, level }), /<path/g))
    expect(waves).toEqual([1, 2, 3, 4])
  })

  it('ink below Level 3 (floods blue), red from Level 3; a faint halo at Level 4, and a pulse for cyclones', () => {
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 2 })).toContain(`stroke="${INK}"`)
    expect(symbolSvg({ category: 'flood', size: 24, level: 2 })).toContain(`stroke="${FLOOD_BLUE}"`)
    expect(symbolSvg({ category: 'flood', size: 24, level: 3 })).toContain(`stroke="${ACCENT}"`)
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 3 })).toContain(`stroke="${ACCENT}"`)
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 3 })).not.toContain('fill-opacity="0.08"')
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 4 })).toContain('fill-opacity="0.08"')
    expect(symbolSvg({ category: 'flood', size: 30, level: 4 })).toContain('fill-opacity="0.08"')
    const spec = { category: 'cyclone' as const, strength: 222, number: 1, closed: false }
    expect(markerHtml({ ...spec, level: 4 }, false).html).toContain('map-pulse')
    expect(markerHtml({ ...spec, level: 3 }, false).html).not.toContain('map-pulse')
  })

  it('cyclones grow with wind speed', () => {
    expect([63, 150, 222].map(cycloneSize)).toEqual([18, 32, 43])
  })

  it('fire dots: ember, stronger above normal, red from Level 3', () => {
    expect([0, 1, 2, 3, 4].map((l) => fireDot(l as Level | 0))).toEqual([
      { color: EMBER, opacity: 0.55 },
      { color: EMBER, opacity: 0.55 },
      { color: EMBER, opacity: 0.75 },
      { color: ACCENT, opacity: 0.8 },
      { color: ACCENT, opacity: 0.8 },
    ])
  })

  it('a label goes left of its square, else to a clear side, else nowhere', () => {
    const at = { x: 100, y: 100 }
    // A badge right where the left-hand label would go.
    const badge = markerBoxes({ category: 'fire', strength: null, level: 3, number: 7, closed: false }, { x: 60, y: 100 })
    expect(placeLabel(at, 11, 50, 12, [])).toBe('left')
    expect(placeLabel(at, 11, 50, 12, badge)).toBe('right')
    const boxed = [-1, 1].flatMap((dx) => [-1, 1].map((dy) => ({ x: at.x + dx * 40 - 30, y: at.y + dy * 12 - 8, w: 60, h: 16 })))
    const around = [...boxed, { x: 40, y: 92, w: 120, h: 16 }]
    expect(placeLabel(at, 11, 50, 12, around)).toBeNull()
  })
})
