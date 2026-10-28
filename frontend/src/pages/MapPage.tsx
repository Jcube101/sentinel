import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEditionStrip, useFirePoints, useRecentClosed } from '@/hooks/useEdition'
import { useEditionDesk } from '@/hooks/useEditionDesk'
import { itemCopy } from '@/lib/desk/copy'
import type { DeskEntry } from '@/lib/desk/entries'
import { istShortDate, istTime } from '@/lib/desk/ist'
import { CATEGORY_NAMES, LEVEL_NAMES } from '@/lib/desk/levels'
import { closedMapItems, fireDayOf, mapItems } from '@/lib/desk/mapdata'
import { editionQuery, itemPath } from '@/lib/desk/paths'
import type { Category, Level } from '@/lib/desk/types'
import PaperShell from '@/components/paper/PaperShell'
import PaperMap from '@/components/paper/PaperMap'
import LevelSquares from '@/components/paper/LevelSquares'

const LAYERS: Category[] = ['cyclone', 'flood', 'earthquake', 'fire']
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

/** The map: the edition's items and the day's fires, with the list beside it. */
export default function MapPage() {
  const [search, setSearch] = useSearchParams()
  const asked = search.get('edition')
  const editionParam = asked && /^\d+$/.test(asked) ? Number(asked) : null
  const selected = search.get('item')
  const { latestId, data, entries, ctx, pending, error } = useEditionDesk(editionParam)
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

  const fireDay = data && run ? fireDayOf(data.snapshots, run) : null
  const fires = useFirePoints(fireDay)
  const strip = useEditionStrip(run)
  const closed = useRecentClosed(run, withClosed)

  const items = useMemo(() => (ctx ? mapItems(entries, ctx) : []), [entries, ctx])
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
      <PaperShell>
        <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading the map…</p>
      </PaperShell>
    )
  }

  return (
    <PaperShell>
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
                const placed = items.some((m) => row.itemIds.includes(m.key))
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
            <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">
              Air has no place on the map yet: its figures carry no city positions. Fire states sit at the centre of their fires.
            </p>
          </section>

          <section aria-label="Layers">
            <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 border-b border-ink">Layers</h2>
            <ul className="m-0 p-0 list-none">
              {LAYERS.map((c) => (
                <li key={c} className="flex justify-between items-center py-2 border-b border-rule">
                  <label className="flex items-center gap-2 text-[15px] cursor-pointer">
                    <input type="checkbox" checked={layers.has(c)} onChange={() => toggleLayer(c)} className="accent-[#17171B]" />
                    {LAYER_NAMES[c]}
                  </label>
                  <span className="font-mono text-[11px] text-ink-muted">
                    {c === 'fire'
                      ? fireDay
                        ? `${fireCount} fires · ${DAY.format(new Date(`${fireDay}T00:00:00Z`))}`
                        : ''
                      : items.filter((m) => entries.find((e) => e.itemIds.includes(m.key))?.category === c).length}
                  </span>
                </li>
              ))}
            </ul>
            {fireDay && firesKept && fireCount === 0 && (
              <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">Fire points are kept for 14 days; none are left for this day.</p>
            )}
          </section>
        </aside>

        <section aria-label="Map" className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="h-[62vh] lg:h-[calc(100vh-250px)] min-h-[380px] border border-ink">
            <PaperMap
              items={[...closedItems, ...shown]}
              fires={layers.has('fire') ? (fires.data ?? []) : []}
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
        </section>
      </div>
    </PaperShell>
  )
}
