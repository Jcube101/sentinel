import { useEffect, type ReactNode } from 'react'
import PaperShell from '@/components/paper/PaperShell'
import PaperMap, { type FirePoint, type MapItem } from '@/components/paper/PaperMap'
import { AIR_TINT, airSquareHtml, fireDot, markerHtml, type AirPoint, type MarkerSpec } from '@/components/paper/mapSymbols'
import { SCALE } from '@/lib/desk/scale'
import type { AirBand, Category, Level } from '@/lib/desk/types'
import { quakeStrength } from '@/lib/desk/words'

// /dev/symbols: every map symbol at every level, and a made-up busy day, to
// check symbols no real edition has had yet. Not linked anywhere; built only
// in dev and in preview builds (VITE_DEV_PAGES=1, App.tsx). No data is read.

const LEVELS: Level[] = [1, 2, 3, 4]
const head = 'm-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink'
const cap = 'font-mono text-[11px] leading-[1.35] text-ink-muted text-center'

/** What each level looks like in the data, for the grid's labels and sizes. */
const SAMPLES: Record<'cyclone' | 'earthquake' | 'flood' | 'fire', { strength: (l: Level) => number | null; label: (l: Level) => string }> = {
  cyclone: {
    strength: (l) => [65, 95, 150, 222][l - 1],
    label: (l) => `${['green', 'green, rising', 'orange', 'red'][l - 1]} · ${[65, 95, 150, 222][l - 1]} km/h`,
  },
  earthquake: {
    strength: (l) => [4.5, 5.5, 6.5, 7.4][l - 1],
    label: (l) => {
      const m = [4.5, 5.5, 6.5, 7.4][l - 1]
      return `M${m.toFixed(1)} · ${quakeStrength(m)}`
    },
  },
  flood: { strength: () => null, label: (l) => ['green', 'green, rising', 'orange', 'red'][l - 1] },
  fire: { strength: () => null, label: (l) => (l >= 3 ? 'badge; red dots' : 'badge; ember dots') },
}

function Marker({ spec, selected = false, scale = 1 }: { spec: MarkerSpec; selected?: boolean; scale?: number }) {
  const { html } = markerHtml(spec, selected, scale)
  return <span className="relative inline-block" dangerouslySetInnerHTML={{ __html: html }} />
}

function Cell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 min-w-0">
      <div className="h-[64px] flex items-center justify-center">{children}</div>
      <span className={cap}>{label}</span>
    </div>
  )
}

function Dots({ hot }: { hot: boolean }) {
  const d = fireDot(hot)
  return (
    <span className="inline-flex gap-[3px] ml-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[5px] h-[5px] rounded-full" style={{ background: d.color, opacity: d.opacity }} />
      ))}
    </span>
  )
}

function Grid() {
  const rows: ('cyclone' | 'earthquake' | 'flood' | 'fire')[] = ['cyclone', 'earthquake', 'flood', 'fire']
  return (
    <section className="flex flex-col gap-2">
      <h2 className={head}>Every symbol at every level</h2>
      <div className="grid grid-cols-[90px_repeat(4,minmax(0,1fr))] items-center border-b border-rule">
        <span />
        {LEVELS.map((l) => (
          <span key={l} className="font-mono text-[11px] uppercase tracking-[0.06em] text-center pt-3">
            Level {l}
          </span>
        ))}
        {rows.map((c) => (
          <Row key={c} category={c} />
        ))}
      </div>
    </section>
  )
}

function Row({ category }: { category: 'cyclone' | 'earthquake' | 'flood' | 'fire' }) {
  const s = SAMPLES[category]
  return (
    <>
      <span className="font-cond font-semibold text-[17px] capitalize border-t border-rule self-stretch flex items-center">{category}</span>
      {LEVELS.map((l) => (
        <div key={l} className="border-t border-rule">
          <Cell label={s.label(l)}>
            <Marker spec={{ category, strength: s.strength(l), level: l, number: l + 1, closed: false }} />
            {category === 'fire' && <Dots hot={l >= 3} />}
          </Cell>
        </div>
      ))}
    </>
  )
}

function levelOfMagnitude(m: number): Level {
  return m >= SCALE.quake.level4MinMagnitude ? 4 : m >= SCALE.quake.level3MinMagnitude ? 3 : m >= SCALE.quake.level2MinMagnitude ? 2 : 1
}

function Ramps() {
  const winds = [63, 100, 150, 200, 250]
  const mags = [4.0, 5.0, 6.0, 7.0, 8.0]
  return (
    <section className="flex flex-col gap-2">
      <h2 className={head}>Sizes</h2>
      <div className="grid grid-cols-5 border-b border-rule">
        {winds.map((w) => (
          <Cell key={w} label={`${w} km/h`}>
            <Marker spec={{ category: 'cyclone', strength: w, level: 2, number: null, closed: false }} />
          </Cell>
        ))}
      </div>
      <div className="grid grid-cols-5 border-b border-rule">
        {mags.map((m) => (
          <Cell key={m} label={`M${m.toFixed(1)} · ${quakeStrength(m)} · L${levelOfMagnitude(m)}`}>
            <Marker spec={{ category: 'earthquake', strength: m, level: levelOfMagnitude(m), number: null, closed: false }} />
          </Cell>
        ))}
      </div>
    </section>
  )
}

function States() {
  const cats: Category[] = ['cyclone', 'earthquake', 'flood', 'fire']
  const strength = (c: Category) => (c === 'cyclone' ? 120 : c === 'earthquake' ? 5.6 : null)
  return (
    <section className="flex flex-col gap-2">
      <h2 className={head}>Selected, closed, and the small maps (80%)</h2>
      {(
        [
          ['selected', { selected: true, closed: false, scale: 1 }],
          ['closed', { selected: false, closed: true, scale: 1 }],
          ['small map', { selected: false, closed: false, scale: 0.8 }],
        ] as const
      ).map(([name, o]) => (
        <div key={name} className="grid grid-cols-[90px_repeat(4,minmax(0,1fr))] items-center border-b border-rule">
          <span className="font-mono text-[11px] uppercase tracking-[0.06em]">{name}</span>
          {cats.map((c) => (
            <Cell key={c} label={`${c}, Level 2`}>
              <Marker spec={{ category: c, strength: strength(c), level: 2, number: o.closed ? null : 4, closed: o.closed }} selected={o.selected} scale={o.scale} />
            </Cell>
          ))}
        </div>
      ))}
    </section>
  )
}

const BAND_NAMES: Record<AirBand, string> = { poor: 'poor', very_poor: 'very poor', severe: 'severe' }

function AirSquares() {
  const bands: AirBand[] = ['poor', 'very_poor', 'severe']
  return (
    <section className="flex flex-col gap-2">
      <h2 className={head}>Air squares · a preview: on the map once the pipeline stores city positions (P5)</h2>
      <div className="grid grid-cols-4 border-b border-rule">
        {bands.map((b) => (
          <Cell key={b} label={`${BAND_NAMES[b]} · ${AIR_TINT[b].color}, ${Math.round(AIR_TINT[b].opacity * 100)}%`}>
            <span
              className="relative inline-block"
              dangerouslySetInnerHTML={{ __html: airSquareHtml({ city: 'X', lat: 0, lon: 0, band: b, reading: '' }, false).html }}
            />
          </Cell>
        ))}
        <Cell label="the worst city, labelled">
          <span
            className="relative inline-block -translate-x-8"
            dangerouslySetInnerHTML={{ __html: airSquareHtml({ city: 'Delhi', lat: 0, lon: 0, band: 'severe', reading: '412' }, true).html }}
          />
        </Cell>
      </div>
    </section>
  )
}

// --- a made-up busy day ------------------------------------------------------------

/** A small seeded random generator, so the fake day looks the same on every load. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function fakeFires(): FirePoint[] {
  const rand = seeded(26)
  const clusters: [string, number, number, number, number][] = [
    // state, lat, lon, spread (degrees), count
    ['Punjab', 30.8, 75.4, 0.6, 140],
    ['Haryana', 29.4, 76.4, 0.5, 40],
    ['Madhya Pradesh', 23.2, 77.8, 1.3, 110],
    ['Chhattisgarh', 21.4, 81.8, 0.9, 50],
    ['Uttar Pradesh', 26.8, 80.6, 1.4, 70],
    ['Odisha', 20.6, 84.4, 0.8, 25],
  ]
  const out: FirePoint[] = []
  for (const [state, lat, lon, spread, n] of clusters) {
    for (let i = 0; i < n; i++) {
      // Roughly normal spread: the mean of three uniform draws.
      const g = () => ((rand() + rand() + rand()) / 3 - 0.5) * 2 * spread * 1.6
      out.push({ latitude: lat + g(), longitude: lon + g(), hotspot_count: 1 + Math.floor(rand() * 6), frp_max: 10 + rand() * 60, district: null, state })
    }
  }
  return out
}

function item(
  key: string,
  category: Category,
  level: Level,
  number: number | null,
  lat: number,
  lon: number,
  title: string,
  extra: Partial<MapItem> = {},
): MapItem {
  return { key, category, level, number, lat, lon, title, strength: null, state: null, closed: false, ...extra }
}

// Ranked as the Desk ranks: level, then cyclone, flood, earthquake, air, fire. Air (No. 6) has no symbol.
const FAKE_ITEMS: MapItem[] = [
  item('c4', 'cyclone', 4, 1, 17.2, 87.5, 'Cyclone (fake) · red · 222 km/h', { strength: 222 }),
  item('q4', 'earthquake', 4, 2, 28.3, 84.4, 'Major earthquake (fake) · M7.3', { strength: 7.3 }),
  item('c3', 'cyclone', 3, 3, 16.5, 68.0, 'Cyclone (fake) · orange · 150 km/h', { strength: 150 }),
  item('f3', 'flood', 3, 4, 26.3, 92.4, 'Flooding in Assam (fake) · orange'),
  item('q3', 'earthquake', 3, 5, 12.8, 93.6, 'Strong earthquake (fake) · M6.4', { strength: 6.4 }),
  item('fire-pb', 'fire', 3, 7, 30.8, 75.4, 'Punjab (fake): 140 fires', { state: 'Punjab' }),
  item('f2', 'flood', 2, 8, 25.9, 85.9, 'Flooding in Bihar (fake) · green, rising'),
  item('q2', 'earthquake', 2, 9, 24.7, 94.2, 'Moderate earthquake (fake) · M5.4', { strength: 5.4 }),
  item('fire-mp', 'fire', 2, 10, 23.2, 77.8, 'Madhya Pradesh (fake): 110 fires', { state: 'Madhya Pradesh' }),
  item('fire-cg', 'fire', 2, 10, 21.4, 81.8, 'Chhattisgarh (fake): 50 fires', { state: 'Chhattisgarh' }),
  item('c1', 'cyclone', 1, 11, 10.5, 85.0, 'Tropical storm (fake) · green · 70 km/h', { strength: 70 }),
  item('f1', 'flood', 1, 12, 9.9, 76.5, 'Flooding in Kerala (fake) · green'),
  item('q1a', 'earthquake', 1, 13, 32.4, 76.9, 'Light earthquake (fake) · M4.4', { strength: 4.4 }),
  item('q1b', 'earthquake', 1, 13, 30.6, 79.3, 'Light earthquake (fake) · M4.6', { strength: 4.6 }),
  item('q-closed', 'earthquake', 2, null, 34.0, 74.8, 'Closed (fake): moderate earthquake, M5.2', { strength: 5.2, closed: true }),
]

// Worst first; the first is labelled.
const FAKE_AIR: AirPoint[] = (
  [
    ['Delhi', 28.61, 77.21, 'severe', '412'],
    ['Ghaziabad', 28.67, 77.45, 'severe', '405'],
    ['Noida', 28.54, 77.39, 'very_poor', '368'],
    ['Gurugram', 28.46, 77.03, 'very_poor', '342'],
    ['Panipat', 29.39, 76.97, 'very_poor', '330'],
    ['Bhiwadi', 28.21, 76.86, 'very_poor', '315'],
    ['Hisar', 29.15, 75.72, 'poor', '288'],
    ['Lucknow', 26.85, 80.95, 'poor', '262'],
    ['Kanpur', 26.45, 80.33, 'poor', '255'],
    ['Patna', 25.59, 85.14, 'poor', '248'],
    ['Muzaffarpur', 26.12, 85.39, 'poor', '240'],
    ['Jaipur', 26.91, 75.79, 'poor', '231'],
    ['Kolkata', 22.57, 88.36, 'poor', '222'],
    ['Ahmedabad', 23.02, 72.57, 'poor', '215'],
    ['Mumbai', 19.08, 72.88, 'poor', '205'],
  ] as const
).map(([city, lat, lon, band, reading]) => ({ city, lat, lon, band, reading }))

const FAKE_FIRES = fakeFires()

function BusyDay() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={head}>A busy day (made up)</h2>
      <p className="m-0 font-mono text-[11px] text-ink-muted">
        Every hazard at once, ranked as the Desk would rank them. Air (No. 6) is squares, not a symbol; Punjab's fires are at Level 3, so its
        dots are red. Hover a symbol for its label.
      </p>
      <div className="h-[70vh] min-h-[480px] border border-ink">
        <PaperMap items={FAKE_ITEMS} fires={FAKE_FIRES} air={FAKE_AIR} className="h-full w-full" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-ink-muted">
        <span>{FAKE_FIRES.length} fake fires</span>
        <span>{FAKE_AIR.length} fake cities at poor or worse</span>
        <span>{FAKE_ITEMS.length} fake items</span>
      </div>
    </section>
  )
}

/** /dev/symbols: a check sheet for the map symbols. */
export default function DevSymbols() {
  useEffect(() => {
    document.title = 'Sentinel · Map symbols (dev)'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  return (
    <PaperShell>
      <section className="py-8 sm:py-10 border-b border-ink flex flex-col gap-3 max-w-[860px]">
        <h1 className="m-0 font-cond font-semibold text-[32px] sm:text-[44px] leading-[1.04]">Map symbols</h1>
        <p className="m-0 text-[16px] leading-[1.55]">
          A development page, not linked from the site: every map symbol at every level, drawn by the same code as the map, and a made-up busy
          day. Nothing here is real data.
        </p>
      </section>
      <main className="flex flex-col gap-10 pt-8 pb-4 max-w-[1100px]">
        <Grid />
        <Ramps />
        <States />
        <AirSquares />
        <BusyDay />
      </main>
    </PaperShell>
  )
}
