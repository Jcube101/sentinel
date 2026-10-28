import { describe, expect, it } from 'vitest'
import { ACCENT, EMBER, INK, cycloneSize, fireDot, markerHtml, quakeSize, symbolSvg } from './mapSymbols'
import type { Level } from '@/lib/desk/types'

// The "A2 · Map symbols" rules, as the map draws them (/dev/symbols shows them all).
const count = (svg: string, re: RegExp) => (svg.match(re) ?? []).length / 2 // halo + ink draw each line once

describe('map symbols', () => {
  it('earthquake: one ripple ring per level, around the epicentre', () => {
    const rings = ([1, 2, 3, 4] as Level[]).map((level) => count(symbolSvg({ category: 'earthquake', size: 30, level }), /<circle[^>]*stroke-opacity/g))
    expect(rings).toEqual([1, 2, 3, 4])
  })

  it('flood: one wave line per level', () => {
    const waves = ([1, 2, 3, 4] as Level[]).map((level) => count(symbolSvg({ category: 'flood', size: 24, level }), /<path/g))
    expect(waves).toEqual([1, 2, 3, 4])
  })

  it('ink below Level 3, red from Level 3; a faint halo and a pulse only at Level 4', () => {
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 2 })).toContain(`stroke="${INK}"`)
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 3 })).toContain(`stroke="${ACCENT}"`)
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 3 })).not.toContain('fill-opacity="0.12"')
    expect(symbolSvg({ category: 'cyclone', size: 30, level: 4 })).toContain('fill-opacity="0.12"')
    const spec = { category: 'cyclone' as const, strength: 222, number: 1, closed: false }
    expect(markerHtml({ ...spec, level: 4 }, false).html).toContain('map-pulse')
    expect(markerHtml({ ...spec, level: 3 }, false).html).not.toContain('map-pulse')
  })

  it('sizes: cyclones by wind, quakes by magnitude', () => {
    expect([63, 150, 222].map(cycloneSize)).toEqual([18, 32, 43])
    expect([4.0, 5.5, 7.0].map(quakeSize)).toEqual([14, 28, 41])
  })

  it('fire dots: ember, red only in a state at Level 3 and up', () => {
    expect(fireDot(false).color).toBe(EMBER)
    expect(fireDot(true).color).toBe(ACCENT)
  })
})
