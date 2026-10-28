import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  allClearRows,
  closedSubject,
  level3Title,
  quietHeadline,
  quietStandfirst,
  watchCopy,
  type CopyContext,
} from '@/lib/desk/copy'
import { snapshotEntry, type DeskEntry } from '@/lib/desk/entries'
import { istShortDate } from '@/lib/desk/ist'
import { LEVEL_NAMES } from '@/lib/desk/levels'
import { closedSummaries, daysSinceLevel3, quietStreak, stripDays, type StripDay } from '@/lib/desk/quiet'
import type { CategoryStatus, DeskHistory, Edition, WatchRow } from '@/lib/desk/types'
import { numberWord } from '@/lib/desk/words'
import LevelSquares from './LevelSquares'

const head = 'm-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink flex justify-between gap-3'
const meta = 'font-mono text-[11px] sm:text-[12px] leading-[1.5]'

/** "26 Oct" from an IST day key. */
function shortDay(day: string): string {
  return istShortDate(`${day}T06:30:00Z`)
}

function NoSquares() {
  return (
    <span className="flex gap-0.5 sm:gap-[3px]" role="img" aria-label="Nothing open">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-fill" />
      ))}
    </span>
  )
}

function DaysSince({ days, last, ctx }: { days: number | null; last: DeskHistory['lastLevel3']; ctx: CopyContext }) {
  return (
    <div className="flex flex-col gap-1.5 sm:items-end sm:text-right">
      <span className="font-cond font-bold text-[56px] sm:text-[84px] leading-[0.9]">{days ?? '—'}</span>
      <span className="font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.06em]">
        {days === 1 ? 'Day' : 'Days'} since a Level 3+ item
      </span>
      <span className="font-mono text-[11px] text-ink-muted uppercase tracking-[0.04em] max-w-[300px]">
        {last
          ? `Last: ${level3Title(last, ctx)} · ${days === 0 ? 'earlier today' : istShortDate(last.pipeline_runs?.started_at ?? last.taken_at)}`
          : 'None since Sentinel began'}
      </span>
    </div>
  )
}

function Meter({ value, threshold, label }: { value: number; threshold: number; label: string }) {
  const max = threshold * 1.25
  const at = (x: number) => `${Math.min(100, Math.max(0, (x / max) * 100))}%`
  return (
    <div className="max-w-[520px] flex flex-col gap-1.5" aria-hidden>
      <div className="relative h-2 bg-fill">
        <div className="absolute inset-y-0 left-0 bg-ink" style={{ width: at(value) }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-accent" style={{ left: at(threshold) }} />
      </div>
      <div className="relative h-4 font-mono text-[11px]">
        <span className="absolute left-0">
          <b>{value}</b> now
        </span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-accent" style={{ left: at(threshold) }}>
          {threshold} · {label}
        </span>
      </div>
    </div>
  )
}

function Watching({ rows, latest, ctx }: { rows: WatchRow[] | null; latest: boolean; ctx: CopyContext }) {
  return (
    <section aria-label="Watching">
      <h2 className={head}>
        <span>Watching · close to the next level</span>
        <span className="text-ink-muted tracking-[0.04em]">{latest ? `${rows?.length ?? 0} now` : 'latest report only'}</span>
      </h2>
      {!latest ? (
        <p className="m-0 py-4 text-[15px] leading-[1.5] text-ink-muted border-b border-rule">
          The watching list is kept for the latest report only, so it can't be shown for this one.
        </p>
      ) : !rows ? (
        <p className="m-0 py-4 font-mono text-[12px] uppercase text-ink-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="m-0 py-4 text-[15px] leading-[1.5] text-ink-muted border-b border-rule">Nothing is close to the next level.</p>
      ) : (
        rows.map((r) => {
          const c = watchCopy(r, ctx)
          const label = r.category === 'air' && r.next_level === 2 ? 'very poor' : `Level ${r.next_level}`
          return (
            <article key={r.id} className="flex gap-3.5 sm:gap-6 py-5 border-b border-ink">
              <div className="w-10 sm:w-[52px] flex-none pt-1">
                <LevelSquares level={r.level} />
              </div>
              <div className="flex flex-col gap-2 min-w-0 flex-1">
                <div className="font-mono text-[10px] sm:text-[12px] tracking-[0.06em] uppercase text-ink-muted">
                  {r.category === 'air' ? 'Air quality' : r.category} · Level {r.level} · {LEVEL_NAMES[r.level]}
                </div>
                <h3 className="m-0 font-cond font-semibold text-[20px] sm:text-[24px] leading-[1.15]">{c.title}</h3>
                <p className="m-0 text-[15px] sm:text-[17px] leading-[1.55]">{c.standfirst}</p>
                {r.value !== null && r.next_threshold !== null && <Meter value={r.value} threshold={r.next_threshold} label={label} />}
                <p className={`${meta} m-0 text-ink-muted`}>
                  {c.trend && <>Last updates: {c.trend} · </>}
                  {r.watch_reason}
                </p>
              </div>
            </article>
          )
        })
      )}
    </section>
  )
}

function AllClear({ entries, status, editionAt }: { entries: DeskEntry[]; status: CategoryStatus[]; editionAt: string }) {
  return (
    <section aria-label="All clear by category">
      <h2 className={head}>
        <span>All clear · by category</span>
        <span className="text-ink-muted tracking-[0.04em]">level now</span>
      </h2>
      <ul className="m-0 p-0 list-none">
        {allClearRows(entries, status, editionAt).map((r) => (
          <li
            key={r.category}
            className="grid grid-cols-[40px_minmax(0,1fr)_auto] sm:grid-cols-[52px_120px_minmax(0,1fr)_auto] gap-x-3 sm:gap-x-4 gap-y-1 py-3.5 border-b border-rule items-baseline"
          >
            <span className="pt-1">{r.level ? <LevelSquares level={r.level} /> : <NoSquares />}</span>
            <span className="font-cond font-semibold text-[17px] sm:text-[19px]">{r.name}</span>
            <span className={`${meta} text-ink-muted text-right sm:order-last`}>{r.source}</span>
            <span className="col-start-2 col-span-2 sm:col-start-auto sm:col-span-1 text-[15px] leading-[1.5]">
              {r.kicker && (
                <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{r.kicker}</span>
              )}
              {r.line}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const BAR: Record<number, string> = { 0: '4%', 1: '25%', 2: '50%', 3: '75%', 4: '100%' }

function DayStrip({ days, lastText }: { days: StripDay[]; lastText: string | null }) {
  return (
    <section aria-label="Last 14 days">
      <h2 className={head}>Last 14 days · highest level per day</h2>
      <div className="flex items-end gap-1 h-[88px] pt-3.5" role="img" aria-label={days.map((d) => `${shortDay(d.day)}: ${d.level === null ? 'no report' : d.level === 0 ? 'nothing open' : `Level ${d.level}`}`).join('; ')}>
        {days.map((d) => (
          <span key={d.day} className="flex-1 h-full flex items-end">
            {d.level === null ? (
              <span className="w-full h-[4%] border-t border-dashed border-fill-strong" />
            ) : (
              <span
                className={`w-full ${d.level >= 3 ? 'bg-accent' : d.today ? 'bg-ink' : 'bg-fill-strong'}`}
                style={{ height: BAR[d.level] }}
              />
            )}
          </span>
        ))}
      </div>
      <div className="flex justify-between pt-1.5 font-mono text-[11px] text-ink-muted uppercase">
        <span>{shortDay(days[0].day)}</span>
        <span>Today</span>
      </div>
      <p className="m-0 pt-3 text-[14px] leading-[1.5] text-ink-muted italic">
        Bar height is the most severe item that day; red is Level 3 or above.{lastText ? ` ${lastText}` : ''}
      </p>
    </section>
  )
}

function RecentlyClosed({ history }: { history: DeskHistory }) {
  const items = closedSummaries(history)
  return (
    <section aria-label="Recently closed">
      <h2 className={head}>Recently closed</h2>
      {items.length === 0 ? (
        <p className="m-0 py-3 text-[15px] text-ink-muted">Nothing has closed yet.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {items.map((c) => (
            <li key={`${c.snapshot.item_id}:${c.snapshot.run_id}`} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3 border-b border-rule">
              <span className={`${meta} uppercase pt-0.5`}>{shortDay(c.closedOn)}</span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] leading-[1.4]">{closedSubject(snapshotEntry(c.snapshot))}</span>
                <span className="font-mono text-[11px] text-ink-muted">
                  peaked at Level {c.peak} · open {c.daysOpen === 0 ? 'under a day' : `${numberWord(c.daysOpen)} ${c.daysOpen === 1 ? 'day' : 'days'}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/archive" className="inline-block mt-2.5 pt-3 pb-0.5 font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent">
        Browse the archive →
      </Link>
    </section>
  )
}

interface Props {
  run: Edition
  entries: DeskEntry[]
  status: CategoryStatus[]
  history: DeskHistory
  /** null while loading; ignored for past editions. */
  watching: WatchRow[] | null
  latest: boolean
  ctx: CopyContext
  /** The small map for the sidebar. */
  map: ReactNode
}

/** The Desk on a quiet day (DeskQuiet): nothing open above Level 1. */
export default function QuietDesk({ run, entries, status, history, watching, latest, ctx, map }: Props) {
  const days = stripDays(history, run)
  const since = daysSinceLevel3(history.lastLevel3, run)
  const last = history.lastLevel3
  const lastText =
    last && since !== null && since < 14
      ? `The last Level ${last.severity_level} was ${level3Title(last, ctx)}.`
      : null
  return (
    <>
      <section className="pt-7 pb-6 sm:pt-9 sm:pb-8 border-b border-ink flex flex-col sm:flex-row sm:flex-wrap gap-6 sm:gap-8 sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3.5 max-w-[860px]">
          <h1 className="m-0 font-cond font-semibold text-[30px] sm:text-[50px] leading-[1.06] sm:leading-[1.04] tracking-[-0.01em]">
            {quietHeadline(quietStreak(days))}
          </h1>
          <p className="m-0 text-[16px] sm:text-[19px] leading-[1.55]">{quietStandfirst(entries, latest ? (watching?.length ?? null) : null)}</p>
        </div>
        <DaysSince days={since} last={last} ctx={ctx} />
      </section>
      <div className="flex flex-wrap gap-x-12 gap-y-8 pt-6 sm:pt-8">
        <main className="flex-[999_1_560px] min-w-0 flex flex-col gap-8">
          <Watching rows={watching} latest={latest} ctx={ctx} />
          <AllClear entries={entries} status={status} editionAt={run.started_at} />
        </main>
        <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-8">
          <DayStrip days={days} lastText={lastText} />
          {map}
          <RecentlyClosed history={history} />
        </aside>
      </div>
    </>
  )
}

