import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEditionStrip, useFirePoints, useRecentClosed } from '@/hooks/useEdition'
import { useEditionDesk } from '@/hooks/useEditionDesk'
import { itemCopy } from '@/lib/desk/copy'
import type { DeskEntry } from '@/lib/desk/entries'
import { istShortDate, istTime } from '@/lib/desk/ist'
import { CATEGORY_NAMES, LEVEL_NAMES } from '@/lib/desk/levels'
import { airPoints, closedMapItems, fireLayerOf, mapItems } from '@/lib/desk/mapdata'
import { editionQuery, itemPath } from '@/lib/desk/paths'
import type { Scale } from '@/lib/desk/scale'
import type { AirBand, Category, Level } from '@/lib/desk/types'
import PaperShell from '@/components/paper/PaperShell'
import PaperMap from '@/components/paper/PaperMap'
import LevelSquares from '@/components/paper/LevelSquares'
import { SourceLine } from '@/components/paper/DeskEntryRow'
import { AIR_TINT, EMBER, badgeHtml, symbolSize, symbolSvg } from '@/components/paper/mapSymbols'
import { sourceCredit } from '@/lib/desk/notes'

const LAYERS: Category[] = ['cyclone', 'flood', 'earthquake', 'fire', 'air']
const LAYER_NAMES: Record<Category, string> = { cyclone: 'Cyclones', flood: 'Floods', earthquake: 'Earthquakes', fire: 'Fire activity', air: 'Air' }

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`px-2 py-1 border font-mono text-[11px] uppercase tracking-[0.05em] ${on ? 'bg-ink text-paper border-ink' : 'border-rule hover:border-ink'}`}
    >
      {children}
    </button>
  )
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** A layer's symbol in the key, drawn by the same code as the map's markers. */
function KeySymbol({ category, level = 2 }: { category: Category; level?: Level }) {
  if (category === 'air') return <AirSquares bands={['poor', 'very_poor']} />
  if (category === 'fire') {
    return (
      <span className="inline-flex items-center justify-center gap-[3px] w-[22px] h-[20px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-[4px] h-[4px] rounded-full ${level >= 3 ? 'bg-accent' : ''} opacity-75`} style={level >= 3 ? undefined : { background: EMBER }} />
        ))}
      </span>
    )
  }
  return <span className="inline-block w-[22px]" aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolSvg({ category, size: 20, level }) }} />
}

/** Air squares as on the map, in a row. */
function AirSquares({ bands }: { bands: AirBand[] }) {
  return (
    <span className="inline-flex items-center justify-center gap-[3px] w-[22px] h-[20px]" aria-hidden="true">
      {bands.map((b) => (
        <span
          key={b}
          className="inline-block rounded-[2px]"
          style={{ width: AIR_TINT[b].size * 0.8, height: AIR_TINT[b].size * 0.8, background: AIR_TINT[b].color, opacity: AIR_TINT[b].opacity }}
        />
      ))}
    </span>
  )
}

const keyRow = 'flex items-center gap-2.5 font-mono text-[11px] leading-[1.45] text-ink-muted'

/** Level 1 and Level 4 side by side for the key, at 70% of their map size. */
function KeyRamp({ category }: { category: Category }) {
  return (
    <span className="flex items-center gap-1 flex-none w-[64px]" aria-hidden="true">
      {([1, 4] as Level[]).map((l) => (
        <span
          key={l}
          className="inline-block"
          dangerouslySetInnerHTML={{ __html: symbolSvg({ category, size: Math.round(symbolSize(category, null, l) * 0.7), level: l }) }}
        />
      ))}
    </span>
  )
}

/** What each symbol means, collapsed below the map: the Layers rows are the short key. */
function HowToRead({ scale }: { scale: Scale | undefined }) {
  const aqi = scale?.air.aqi ?? null
  return (
    <details className="group border-t border-ink">
      <summary className="flex justify-between items-center gap-3 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.08em]">
        <span>How to read the map</span>
        <span className="text-ink-muted tracking-[0.04em]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span> <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <ul aria-label="Map key" className="m-0 p-0 pb-4 list-none grid md:grid-cols-2 gap-x-8 gap-y-2.5">
        <li className={keyRow}>
          <span className="flex items-end gap-0.5 flex-none w-[64px]" aria-hidden="true">
            <span className="inline-block" dangerouslySetInnerHTML={{ __html: symbolSvg({ category: 'cyclone', size: 14, level: 2 }) }} />
            <span className="inline-block" dangerouslySetInnerHTML={{ __html: symbolSvg({ category: 'cyclone', size: 24, level: 2 }) }} />
          </span>
          Spirals grow with a cyclone's wind speed.
        </li>
        <li className={keyRow}>
          <KeyRamp category="earthquake" />
          Earthquakes: one ring more per level as magnitude rises (light, moderate, strong, major).
        </li>
        <li className={keyRow}>
          <KeyRamp category="flood" />
          Floods: one wave line per level, blue until Level 3.
        </li>
        <li className={keyRow}>
          <span className="flex-none w-[64px]">
            <KeySymbol category="cyclone" level={4} />
          </span>
          Red: Level 3 or 4. A faint halo and a slow pulse: Level 4.
        </li>
        <li className={keyRow}>
          <span className="relative flex-none w-[64px] h-[16px]" dangerouslySetInnerHTML={{ __html: badgeHtml(2, 2, 'left:3px;top:0;') }} />
          The number matches the list. A fire state's number sits at the centre of its fires; a group of small earthquakes has one
          number, on the largest.
        </li>
        <li className={keyRow}>
          <span className="flex-none w-[64px]">
            <KeySymbol category="fire" />
          </span>
          Each dot is a fire seen by NASA's satellites, stronger in a state above normal and red at Level 3 or 4. A ring marks a large
          fire near a town.
        </li>
        <li className={keyRow}>
          <span className="flex-none w-[64px]">
            <AirSquares bands={['poor', 'very_poor', 'severe']} />
          </span>
          {aqi
            ? `Each square is a city with poor air or worse: pale for poor (index ${aqi.poorAbove + 1}–${aqi.veryPoorAbove}), dark for very poor (${aqi.veryPoorAbove + 1}–${aqi.severeAbove}), red for severe (${aqi.severeAbove + 1} and over).`
            : 'Each square is a city with poor air or worse: pale for poor, dark for very poor, red for severe.'}{' '}
          Squares sit under everything else; only the worst city is named.
        </li>
      </ul>
    </details>
  )
}

/** The map: the edition's items and the day's fires, with the list beside it. */
export default function MapPage() {
  const [search, setSearch] = useSearchParams()
  const asked = search.get('edition')
  const editionParam = asked && /^\d+$/.test(asked) ? Number(asked) : null
  const selected = search.get('item')
  const { latestId, data, entries, ctx, pending, error } = useEditionDesk(editionParam)
  const scale = ctx?.scale
  const run = data?.run ?? null

  const [minLevel, setMinLevel] = useState<Level>(1)
  const [withClosed, setWithClosed] = useState(false)
  const [layers, setLayers] = useState<Set<Category>>(new Set(LAYERS))
  const toggleLayer = (c: Category) =>
    setLayers((s) => {
      const next = new Set(s)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  const fireLayer = useMemo(() => (data && run ? fireLayerOf(data.snapshots, run) : null), [data, run])
  const fireDay = fireLayer?.day ?? null
  const fires = useFirePoints(fireLayer)
  const strip = useEditionStrip(run)
  const closed = useRecentClosed(run, withClosed)

  const items = useMemo(() => (ctx ? mapItems(entries, ctx) : []), [entries, ctx])
  const airEntry = entries.find((e) => e.category === 'air') ?? null
  const air = useMemo(() => airPoints(entries), [entries])
  const airShown = layers.has('air') && airEntry !== null && airEntry.level >= minLevel ? air : []
  const shown = items
    .filter((m) => m.level >= minLevel)
    .filter((m) => layers.has(entries.find((e) => e.itemIds.includes(m.key))?.category ?? 'air'))
  const closedItems = withClosed ? closedMapItems(closed.data ?? []).filter((m) => m.level >= minLevel) : []
  const rows = entries.filter((e) => e.level >= minLevel)
  const query = run ? editionQuery(run.id, latestId) : ''
  const select = (key: string) => {
    const next = new URLSearchParams(search)
    next.set('item', key)
    setSearch(next, { replace: true })
  }
  const keyOf = (row: DeskEntry) => row.members.find((m) => m.coords)?.key ?? row.key
  const fireCount = fires.data?.length ?? 0
  const firesKept = fireDay !== null && fires.data !== undefined && (fireCount > 0 || !fires.isPending)

  useEffect(() => {
    document.title = run ? `Sentinel · Map, No. ${run.id}` : 'Sentinel · Map'
  }, [run])

  if (error) return <PaperShell><p className="py-10 text-[18px]">Couldn't load the map: {(error as Error).message}</p></PaperShell>
  if (pending || !data || !run || !ctx) {
    return (
      <PaperShell scale={scale}>
        <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading the map…</p>
      </PaperShell>
    )
  }

  return (
    <PaperShell scale={scale}>
      <h1 className="sr-only">The map, No. {run.id}</h1>
      <div className="flex flex-wrap justify-between items-center gap-3 py-2 sm:py-2.5 border-b border-ink font-mono text-[11px] sm:text-[12px] tracking-[0.04em] uppercase">
        <span>
          <Link to={run.id === latestId ? '/' : `/edition/${run.id}`} className="hover:text-accent">
            No. {run.id}
          </Link>{' '}
          · {istShortDate(run.started_at)} · {istTime(run.started_at)} IST
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-muted mr-1">Show</span>
          {([1, 2, 3] as Level[]).map((l) => (
            <Toggle key={l} on={minLevel === l} onClick={() => setMinLevel(l)}>
              Level {l}+
            </Toggle>
          ))}
          <span className="w-2" />
          <Toggle on={!withClosed} onClick={() => setWithClosed(false)}>
            Open
          </Toggle>
          <Toggle on={withClosed} onClick={() => setWithClosed(true)}>
            Incl. closed
          </Toggle>
        </span>
      </div>

      <div className="flex flex-col-reverse lg:flex-row gap-6 pt-5">
        <aside className="lg:w-[360px] flex-none flex flex-col gap-6 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pr-2">
          <section aria-label="Items">
            <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 border-b border-ink">
              Items · by severity
            </h2>
            <ul className="m-0 p-0 list-none">
              {rows.map((row) => {
                const n = entries.indexOf(row) + 1
                const copy = itemCopy(row, ctx)
                const key = keyOf(row)
                const isSel = selected !== null && (row.itemIds.includes(selected) || row.key === selected)
                // A fire row is on the map as its dots, even with no badge (Level 1); air as its squares.
                const placed =
                  row.category === 'fire' || (row.category === 'air' && air.length > 0) || items.some((m) => row.itemIds.includes(m.key))
                return (
                  <li key={row.key} className={`border-b border-rule ${isSel ? 'bg-panel' : ''}`}>
                    <button type="button" onClick={() => select(key)} className="w-full text-left flex gap-3 py-3 px-1">
                      <span className="flex flex-col gap-1.5 w-8 flex-none">
                        <span className={`font-cond font-bold text-[24px] leading-none ${row.level === 4 ? 'text-accent' : ''}`}>{n}</span>
                        <LevelSquares level={row.level} wouldBe={row.wouldBe} />
                      </span>
                      <span className="flex flex-col gap-1 min-w-0">
                        <span className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.05em] text-ink-muted">
                          L{row.level} {LEVEL_NAMES[row.level]} · {CATEGORY_NAMES[row.category]}
                          {!placed && ' · not on the map'}
                        </span>
                        <span className="font-cond font-semibold text-[17px] leading-[1.2]">{copy.title}</span>
                      </span>
                    </button>
                    {isSel && (
                      <div className="px-1 pb-3 pl-12 flex flex-col gap-2">
                        {copy.standfirst && <p className="m-0 text-[14px] leading-[1.5]">{copy.standfirst}</p>}
                        <SourceLine text={sourceCredit(row)} />
                        <Link
                          to={row.members.length > 0 ? itemPath(selected!) + query : itemPath(row.key) + query}
                          className="self-start font-mono text-[11px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent"
                        >
                          Read the item →
                        </Link>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-label="Layers">
            <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 border-b border-ink">Layers</h2>
            <ul className="m-0 p-0 list-none">
              {LAYERS.map((c) => (
                <li key={c} className="flex justify-between items-center py-2 border-b border-rule">
                  <label className="flex items-center gap-2 text-[15px] cursor-pointer">
                    <input type="checkbox" checked={layers.has(c)} onChange={() => toggleLayer(c)} className="accent-[#17171B]" />
                    <KeySymbol category={c} />
                    {LAYER_NAMES[c]}
                  </label>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {c === 'fire'
                      ? fireDay
                        ? `${fireCount} fires · ${DAY.format(new Date(`${fireDay}T00:00:00Z`))}`
                        : ''
                      : c === 'air'
                        ? `${air.length} ${air.length === 1 ? 'city' : 'cities'}`
                        : items.filter((m) => entries.find((e) => e.itemIds.includes(m.key))?.category === c).length}
                  </span>
                </li>
              ))}
            </ul>
            {fireDay && firesKept && fireCount === 0 && (
              <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">No fire points are stored for this day.</p>
            )}
            {airEntry && air.length === 0 && Array.isArray(airEntry.figures.cities) && airEntry.figures.cities.length > 0 && (
              <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">This edition's air figures carry no city positions.</p>
            )}
          </section>
        </aside>

        <section aria-label="Map" className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="h-[62vh] lg:h-[calc(100vh-250px)] min-h-[380px] border border-ink">
            <PaperMap
              items={[...closedItems, ...shown]}
              fires={layers.has('fire') ? (fires.data ?? []) : []}
              air={airShown}
              airKey={airEntry?.key ?? null}
              selected={selected}
              onSelect={select}
              className="h-full w-full"
            />
          </div>
          {strip.data && strip.data.length > 0 && (
            <div>
              <div className="flex items-end gap-[3px] h-[40px]" aria-label="The last 21 editions, highest level in each">
                {strip.data.map((r) => (
                  <Link
                    key={r.id}
                    to={r.id === latestId ? '/map' : `/map?edition=${r.id}`}
                    title={`No. ${r.id} · ${istShortDate(r.started_at)} ${istTime(r.started_at)} · Level ${r.level}`}
                    className="flex-1 h-full flex items-end"
                  >
                    <span
                      className={`w-full ${r.id === run.id ? 'outline outline-2 outline-offset-1 outline-ink' : ''} ${r.level >= 3 ? 'bg-accent' : r.level > 0 ? 'bg-fill-strong' : 'bg-fill'}`}
                      style={{ height: `${Math.max(1, r.level) * 25}%` }}
                    />
                  </Link>
                ))}
              </div>
              <div className="flex justify-between pt-1 font-mono text-[11px] text-ink-muted uppercase">
                <span>No. {strip.data[0].id}</span>
                <span>Editions, highest level in each · No. {strip.data.at(-1)!.id}</span>
              </div>
            </div>
          )}
          <HowToRead scale={scale} />
        </section>
      </div>
    </PaperShell>
  )
}
