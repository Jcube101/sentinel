import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useChangeWindow, useEdition, useFireDaily, useFirePoints, useItem, useLatestEditionId } from '@/hooks/useEdition'
import { cityReading, entryCard, normText, worstCities } from '@/lib/desk/cards'
import { sinceYesterday, type Movement } from '@/lib/desk/changes'
import { closedLine, copyContext, itemCopy } from '@/lib/desk/copy'
import { counted, deskEntries, snapshotEntry, AIR_BAND_LABELS, type DeskEntry } from '@/lib/desk/entries'
import { fireDays, itemHistory, levelBars, openSince, type DayCount } from '@/lib/desk/item'
import { istDate, istShortDate, istTime } from '@/lib/desk/ist'
import { CATEGORY_NAMES, LEVEL_NAMES } from '@/lib/desk/levels'
import { editionQuery, itemPath } from '@/lib/desk/paths'
import { SCALE } from '@/lib/desk/scale'
import type { Change, Figures, TimedSnapshot } from '@/lib/desk/types'
import { placeOf, placeText } from '@/lib/desk/where'
import { lastKnownWords } from '@/lib/desk/words'
import PaperShell from '@/components/paper/PaperShell'
import LevelSquares from '@/components/paper/LevelSquares'
import MiniMap from '@/components/paper/MiniMap'
import { fireDayOf, mapItems } from '@/lib/desk/mapdata'
import { Chips, Strip } from '@/components/paper/DeskEntryRow'

const head = 'm-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink flex justify-between gap-3'
const meta = 'font-mono text-[11px] sm:text-[12px] leading-[1.5]'

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className={head}>
        <span>{title}</span>
        {right && <span className="text-ink-muted tracking-[0.04em]">{right}</span>}
      </h2>
      {children}
    </section>
  )
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayText = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`))

/** Fires per day as bars, with the usual rate and the Level 2 and 3 lines. */
function FireChart({ days, norm }: { days: DayCount[]; norm: number | null }) {
  const lines = norm
    ? [
        { at: norm, label: `usual ${normText(norm)}`, strong: false },
        { at: norm * SCALE.fire.level2MinRatio, label: `Level 2 · ${SCALE.fire.level2MinRatio}× usual`, strong: true },
        { at: norm * SCALE.fire.level3MinRatio, label: `Level 3 · ${SCALE.fire.level3MinRatio}× usual`, strong: true },
      ]
    : []
  const top = Math.max(...days.map((d) => d.fires), ...lines.map((l) => l.at)) * 1.08 || 1
  const pct = (v: number) => `${(v / top) * 100}%`
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-[180px] sm:h-[220px] border-b border-ink">
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {days.map((d, i) => (
            <span
              key={d.day}
              title={`${dayText(d.day)}: ${d.fires} fires`}
              className={`flex-1 ${i === days.length - 1 ? 'bg-accent' : norm && d.fires >= norm * SCALE.fire.level2MinRatio ? 'bg-ink' : 'bg-fill-strong'}`}
              style={{ height: pct(d.fires) }}
            />
          ))}
        </div>
        {lines.map((l) => (
          <div key={l.label} className={`absolute inset-x-0 border-t ${l.strong ? 'border-dashed border-ink' : 'border-ink-muted'}`} style={{ bottom: pct(l.at) }}>
            <span className="absolute right-0 -top-4 font-mono text-[10px] uppercase bg-paper pl-1">{l.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink-muted uppercase">
        <span>{days.length > 0 ? dayText(days[0].day) : ''}</span>
        <span>{days.length > 0 ? `${dayText(days.at(-1)!.day)} · ${days.at(-1)!.fires}` : ''}</span>
      </div>
    </div>
  )
}

function Table({ head: cols, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[12px] sm:text-[13px] leading-[1.35]">
        <thead>
          <tr className="border-b border-rule">
            {cols.map((c, i) => (
              <th key={c} scope="col" className={`py-1.5 pr-3 font-normal text-[10px] uppercase tracking-[0.05em] text-ink-muted ${i === 0 ? 'text-left' : 'text-right'}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-rule">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j === 0 ? 'text-left' : 'text-right'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_minmax(0,1fr)] sm:grid-cols-[180px_minmax(0,1fr)] gap-3 py-2 border-b border-rule">
          <dt className={`${meta} uppercase text-ink-muted`}>{k}</dt>
          <dd className="m-0 text-[15px] leading-[1.45]">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

const TAGS: Record<Change | 'latest' | 'last_known', string> = {
  opened: '+ NEW',
  reopened: '+ BACK',
  escalated: '▲ UP',
  deescalated: '▼ DOWN',
  closed: '− CLOSED',
  latest: '· LATEST',
  last_known: '◌ LAST KNOWN',
}

function History({ snaps }: { snaps: TimedSnapshot[] }) {
  const bars = levelBars(snaps)
  return (
    <Section title="How it has moved" right={`${snaps.length} ${snaps.length === 1 ? 'report' : 'reports'}`}>
      <div className="flex items-end gap-[3px] h-[56px]" role="img" aria-label="Level in each report">
        {bars.map((b) => (
          <span key={b.runId} className="flex-1 h-full flex items-end" title={`No. ${b.runId}: Level ${b.level}`}>
            <span
              className={`w-full ${b.closed ? 'bg-fill' : b.level >= 3 ? 'bg-accent' : 'bg-ink'} ${b.lastKnown ? 'opacity-40' : ''}`}
              style={{ height: `${b.level * 25}%` }}
            />
          </span>
        ))}
      </div>
      <ul className="m-0 p-0 list-none">
        {itemHistory(snaps).map((h) => (
          <li key={h.runId} className="grid grid-cols-[96px_minmax(0,1fr)] sm:grid-cols-[150px_110px_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2.5 border-b border-rule">
            <Link to={`/edition/${h.runId}`} className={`${meta} uppercase hover:text-accent`}>
              No. {h.runId} · {istShortDate(h.at)} {istTime(h.at)}
            </Link>
            <span className={`${meta} font-semibold ${h.kind === 'opened' || h.kind === 'reopened' ? 'text-accent' : ''}`}>
              {TAGS[h.kind]} · L{h.level}
            </span>
            <span className="col-span-2 sm:col-span-1 text-[15px] leading-[1.4]">{h.note}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function FireDetail({ shown, snaps }: { shown: TimedSnapshot; snaps: TimedSnapshot[] }) {
  const f = shown.figures
  const daily = useFireDaily(typeof f.state === 'string' ? f.state : null)
  const days = fireDays(shown, daily.data ?? [], snaps)
  const districts = Array.isArray(f.districts) ? [...f.districts].sort((a, b) => b.fire_events - a.fire_events) : []
  return (
    <>
      <Section title="Fires per day against the usual" right={`last ${days.length} days`}>
        {days.length > 0 && <FireChart days={days} norm={typeof f.norm_daily_events === 'number' ? f.norm_daily_events : null} />}
        <p className={`${meta} m-0 text-ink-muted`}>
          Full days in UTC, from NASA's fire satellites. The usual line is the average for this time of year in{' '}
          {String(f.norm_years ?? SCALE.fire.baselineYears).replace('-', '–')}.
        </p>
      </Section>
      {districts.length > 0 && (
        <Section title="By district" right={f.day ? dayText(f.day) : undefined}>
          <Table
            head={['District', 'Fires', 'Hotspots', 'Hottest fire, MW']}
            rows={districts.map((d) => [d.district, <b key="n">{d.fire_events}</b>, d.hotspots ?? '—', d.frp_max ?? '—'])}
          />
        </Section>
      )}
    </>
  )
}

function AirDetail({ f }: { f: Figures }) {
  const cities = worstCities(f)
  return (
    <Section title="Cities at poor or worse" right={typeof f.cities_reporting === 'number' ? `of ${f.cities_reporting} reporting` : undefined}>
      <Table
        head={['City', 'State', 'Reading', 'Band', 'Main pollutant']}
        rows={cities.map((c) => [
          c.city,
          c.state ?? '',
          cityReading(c),
          AIR_BAND_LABELS[counted(c)].toLowerCase() + (c.counted_as && c.counted_as !== c.band ? ' (read severe)' : ''),
          c.prominent?.join(', ') ?? '',
        ])}
      />
      {typeof f.method === 'string' && <p className={`${meta} m-0 text-ink-muted`}>How it is measured: {f.method}</p>}
    </Section>
  )
}

function QuakeDetail({ e, observed }: { e: DeskEntry; observed: string | null }) {
  const f = e.figures
  const id = e.sourceRef?.replace(/^USGS-/, '')
  return (
    <Section title="The quake">
      <Facts
        items={[
          ['When', observed ? `${istDate(observed)}, ${istTime(observed)} IST` : '—'],
          ['Where', e.placeName ?? '—'],
          ['Magnitude', `${(f.magnitude ?? e.strength).toFixed(1)}${f.magnitude_type ? ` (${f.magnitude_type})` : ''}`],
          ['Depth', typeof f.depth_km === 'number' ? `${Math.round(f.depth_km)} km` : '—'],
          ['India', f.in_india ? 'Inside India' : typeof f.km_from_india === 'number' ? `${Math.round(f.km_from_india)} km outside` : '—'],
          ['Felt reports', String(f.felt_reports ?? 0)],
          ['Impact alert (PAGER)', f.usgs_alert ?? 'none'],
          ['Tsunami flag', f.tsunami ? 'set' : 'not set'],
          ['Source', id ? <a href={`https://earthquake.usgs.gov/earthquakes/eventpage/${id}`} target="_blank" rel="noreferrer" className="border-b border-ink hover:text-accent">USGS event page ↗</a> : 'USGS'],
        ]}
      />
    </Section>
  )
}

function GdacsDetail({ e }: { e: DeskEntry }) {
  const f = e.figures
  const place = e.coords ? placeOf(e.coords[0], e.coords[1]) : null
  return (
    <Section title={e.category === 'cyclone' ? 'The storm' : 'The flood'}>
      <Facts
        items={[
          ['Alert now', String(f.episode_alert_level ?? f.alert_level ?? '—')],
          ['Highest alert', String(f.alert_level ?? '—')],
          ...(typeof f.severity === 'number' && f.severity_unit ? [['Severity', `${Math.round(f.severity)} ${f.severity_unit}`] as [string, string]] : []),
          ...(f.severity_text ? [['GDACS says', String(f.severity_text)] as [string, string]] : []),
          ['Alert score', `${f.alert_score ?? '—'}${typeof f.prev_episode_alert_score === 'number' ? ` (previous update ${f.prev_episode_alert_score})` : ''}`],
          ['Mapped area', place && e.coords ? `centred ${placeText(place)} (${e.coords[0].toFixed(1)}°N, ${e.coords[1].toFixed(1)}°E)` : 'not known for this report'],
          ['Source', f.gdacs_url ? <a href={String(f.gdacs_url)} target="_blank" rel="noreferrer" className="border-b border-ink hover:text-accent">GDACS report ↗</a> : 'GDACS'],
        ]}
      />
      <p className={`${meta} m-0 text-ink-muted`}>
        GDACS's point is the centre of the area it maps for the event, not the storm's own position. No track or landfall is forecast here.
      </p>
    </Section>
  )
}

function CountFunnel({ f }: { f: Figures }) {
  const step = (label: string, value: number | undefined) => (
    <div className="flex justify-between gap-3 py-2 border-b border-rule">
      <span className="text-[15px]">{label}</span>
      <b className="font-mono">{value ?? '—'}</b>
    </div>
  )
  return (
    <Section title="How the count is built">
      <div className="flex flex-col">
        {step('Satellite hotspots kept', f.hotspots)}
        <p className={`${meta} m-0 py-1 text-ink-muted`}>↓ hotspots within 1.5 km on the same day are one fire</p>
        {step('Fires', f.fire_events)}
        <p className={`${meta} m-0 py-1 text-ink-muted`}>↓ placed in districts, compared with the same time of year</p>
        {step('Districts with fires', f.district_count)}
      </div>
      <p className="m-0 text-[14px] leading-[1.5] text-ink-muted italic">
        A hotspot is one 375 m satellite pixel that read hot. One field fire can light several, so Sentinel counts fires, not pixels.
      </p>
    </Section>
  )
}

/** One item: its story as of an edition, the evidence, and how it has moved. */
export default function Item() {
  const { category = '', ref = '' } = useParams()
  const [search] = useSearchParams()
  const asked = search.get('edition')
  const editionParam = asked && /^\d+$/.test(asked) ? Number(asked) : null
  const id = `${category}:${ref}`

  const latest = useLatestEditionId()
  const latestId = latest.data ?? null
  const item = useItem(id, editionParam)
  const snaps = useMemo(() => item.data?.snapshots ?? [], [item.data])
  const shown = snaps.at(-1) ?? null
  const edition = useEdition(shown?.run_id ?? null)
  const run = edition.data?.run ?? null
  const changeWindow = useChangeWindow(run && run.status !== 'running' ? run : null)
  const since = useMemo(
    () => (edition.data && changeWindow.data ? sinceYesterday(edition.data.snapshots, changeWindow.data) : null),
    [edition.data, changeWindow.data],
  )
  const entries = useMemo(() => {
    if (!edition.data) return []
    const moves = since?.byItem ?? (changeWindow.isError ? new Map<string, Movement>() : undefined)
    return deskEntries(edition.data.snapshots, moves)
  }, [edition.data, since, changeWindow.isError])
  const ctx = useMemo(() => (run ? copyContext(entries, since, run) : null), [run, entries, since])
  const flat = entries.flatMap((e) => (e.members.length > 0 ? e.members : [e]))
  const entry = flat.find((e) => e.key === id) ?? (shown ? snapshotEntry(shown, since?.byItem) : null)
  const closed = shown?.status === 'closed'
  const copy = entry && ctx ? (closed ? { title: closedLine(entry), standfirst: null } : itemCopy(entry, ctx)) : null
  const index = flat.findIndex((e) => e.key === id)
  const q = (n: number) => editionQuery(n, latestId)
  const query = run ? q(run.id) : ''

  const firePoints = useFirePoints(edition.data && run ? fireDayOf(edition.data.snapshots, run) : null)
  const pageTitle = copy?.title ?? null
  useEffect(() => {
    document.title = pageTitle ? `Sentinel · ${pageTitle}` : 'Sentinel · Item'
  }, [pageTitle])

  if (!item.isPending && (!item.data?.item || !shown)) {
    return (
      <PaperShell>
        <p className="py-10 text-[18px]">
          There is no item “{id}”{editionParam !== null ? ` in No. ${editionParam} or before` : ''}.{' '}
          <Link to="/" className="border-b border-ink hover:text-accent">
            Back to the latest report →
          </Link>
        </p>
      </PaperShell>
    )
  }
  if (!entry || !copy || !run || !shown) {
    return (
      <PaperShell>
        <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading…</p>
      </PaperShell>
    )
  }

  const card = entryCard(entry)
  const since_ = openSince(snaps)
  const prev = index > 0 ? flat[index - 1] : null
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null
  const others = entries.filter((e) => !e.itemIds.includes(id))
  const observed = item.data?.item?.observed_at ?? null

  return (
    <PaperShell footer={<span>{`Item ${id}`}</span>}>
      <div className="flex flex-wrap justify-between gap-3 py-2 sm:py-2.5 border-b border-ink font-mono text-[11px] sm:text-[12px] tracking-[0.04em] uppercase">
        <span>
          <Link to={run.id === latestId ? '/' : `/edition/${run.id}`} className="hover:text-accent">
            ← No. {run.id}
          </Link>{' '}
          · {istShortDate(run.started_at)} · {istTime(run.started_at)} IST
          {index >= 0 && ` · item ${index + 1} of ${flat.length}`}
        </span>
        <span className="flex gap-4">
          {prev && (
            <Link to={itemPath(prev.key) + query} className="hover:text-accent">
              ‹ Item {index}
            </Link>
          )}
          {next && (
            <Link to={itemPath(next.key) + query} className="hover:text-accent">
              Item {index + 2} ›
            </Link>
          )}
        </span>
      </div>

      <section className="pt-7 pb-6 sm:pt-9 sm:pb-8 border-b border-ink flex flex-col gap-3.5 max-w-[920px]">
        <div className="flex flex-wrap items-center gap-3">
          <LevelSquares level={entry.level} wouldBe={entry.wouldBe} />
          {closed ? (
            <span className="font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.06em]">
              Closed · {CATEGORY_NAMES[entry.category]} · was Level {entry.level} · {LEVEL_NAMES[entry.level]}
            </span>
          ) : (
            <Chips entry={entry} />
          )}
        </div>
        <h1 className="m-0 font-cond font-semibold text-[30px] sm:text-[46px] leading-[1.06] tracking-[-0.01em]">{copy.title}</h1>
        {copy.standfirst && <p className="m-0 text-[17px] sm:text-[19px] leading-[1.55]">{copy.standfirst}</p>}
        <p className={`${meta} m-0 text-ink-muted uppercase tracking-[0.04em]`}>
          {since_ && !closed && <>Open since {istShortDate(since_)} · </>}
          Level from: <span className="normal-case">{entry.reason}</span>
        </p>
        {entry.lastKnown && (
          <p className={`${meta} m-0 text-accent font-semibold`}>
            <span className="uppercase tracking-[0.04em]">Last known:</span> {lastKnownWords(entry.lastKnownWhy)}
          </p>
        )}
        {card && card.cells.length > 0 && (
          <div className="pt-1 text-ink-muted">
            <Strip card={card} />
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-x-12 gap-y-8 pt-6 sm:pt-8">
        <main className="flex-[999_1_560px] min-w-0 flex flex-col gap-8">
          {entry.category === 'fire' && <FireDetail shown={shown} snaps={snaps} />}
          {entry.category === 'air' && <AirDetail f={entry.figures} />}
          {entry.category === 'earthquake' && <QuakeDetail e={entry} observed={observed} />}
          {(entry.category === 'cyclone' || entry.category === 'flood') && <GdacsDetail e={entry} />}
          <History snaps={snaps} />
        </main>
        <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-8">
          {entry.category === 'fire' && <CountFunnel f={entry.figures} />}
          <MiniMap
            items={ctx ? mapItems(entries, ctx) : []}
            fires={firePoints.data ?? []}
            selected={id}
            to={`/map?item=${encodeURIComponent(id)}${query ? `&${query.slice(1)}` : ''}`}
            note={entry.coords ? null : entry.category === 'air' ? 'Air has no place on the map yet.' : 'No position for this item in this edition.'}
          />
          <Section title={`Elsewhere in No. ${run.id}`}>
            {others.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-muted">Nothing else is open.</p>
            ) : (
              <ul className="m-0 p-0 list-none">
                {others.map((o) => {
                  const c = ctx ? itemCopy(o, ctx) : null
                  const to = o.members.length > 0 ? itemPath(o.members[0].key) + query : itemPath(o.key) + query
                  return (
                    <li key={o.key} className="py-2.5 border-b border-rule">
                      <Link to={to} className="flex flex-col gap-0.5 hover:text-accent">
                        <span className={`${meta} uppercase text-ink-muted`}>
                          L{o.level} {LEVEL_NAMES[o.level]} · {CATEGORY_NAMES[o.category]}
                        </span>
                        <span className="text-[15px] leading-[1.4]">{c?.title}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>
        </aside>
      </div>

      <p className={`${meta} m-0 mt-10 text-ink-muted`}>
        {istDate(run.started_at)} edition ·{' '}
        <Link to={itemPath(id, run.id)} className="border-b border-ink-muted hover:text-accent">
          Permalink to this item as of No. {run.id}
        </Link>
      </p>
    </PaperShell>
  )
}
