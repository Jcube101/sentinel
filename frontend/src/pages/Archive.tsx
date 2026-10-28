import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useArchiveMonth, useArchiveSpan, useClosedInMonth } from '@/hooks/useEdition'
import { archiveLead, chooseDayEdition, dayMaxLevels, monthDays, monthOf, runsByDay, shiftMonth, slotOf } from '@/lib/desk/archive'
import { closedSubject } from '@/lib/desk/copy'
import { snapshotEntry } from '@/lib/desk/entries'
import { istDay, istShortDate } from '@/lib/desk/ist'
import { LEVEL_NAMES } from '@/lib/desk/levels'
import { itemPath } from '@/lib/desk/paths'
import { closedSummaries } from '@/lib/desk/quiet'
import type { Level } from '@/lib/desk/types'
import { numberWord } from '@/lib/desk/words'
import PaperShell from '@/components/paper/PaperShell'
import LevelSquares from '@/components/paper/LevelSquares'

const head = 'm-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink flex justify-between gap-3'
const meta = 'font-mono text-[11px] sm:text-[12px] leading-[1.5]'

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function monthName(month: string): string {
  return MONTH.format(new Date(`${month}-15T12:00:00Z`))
}

function Squares({ level }: { level: Level | 0 }) {
  if (level === 0) {
    return (
      <span className="flex gap-0.5 sm:gap-[3px]" role="img" aria-label="Nothing open">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="w-2 h-2 sm:w-2.5 sm:h-2.5 bg-fill" />
        ))}
      </span>
    )
  }
  return <LevelSquares level={level} />
}

/** The archive: every day with an edition, a month at a time, newest first. */
export default function Archive() {
  const [search] = useSearchParams()
  const span = useArchiveSpan()
  const first = span.data?.first ?? null
  const last = span.data?.latest ?? null
  const asked = search.get('month')
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : last ? monthOf(last.started_at) : null
  const data = useArchiveMonth(month)
  const closed = useClosedInMonth(month)

  useEffect(() => {
    document.title = month ? `Sentinel · Archive, ${monthName(month)}` : 'Sentinel · Archive'
  }, [month])

  const rows = useMemo(() => {
    if (!data.data || !month || !first || !last) return []
    const { runs, traces, open } = data.data
    const byDay = runsByDay(runs)
    const levels = dayMaxLevels(runs, traces)
    return monthDays(month, istDay(first.started_at), istDay(last.started_at)).map((day) => {
      const dayRuns = byDay.get(day) ?? []
      const chosen = chooseDayEdition(dayRuns)
      if (!chosen) return { day, chosen: null, others: 0, max: 0 as Level | 0, lead: null }
      const lead = archiveLead(chosen.run, open.filter((s) => s.run_id === chosen.run.id), runs, traces)
      return { day, chosen, others: dayRuns.length - 1, max: levels.get(day) ?? 0, lead }
    })
  }, [data.data, month, first, last])

  const closings = closed.data ? closedSummaries(closed.data) : null

  const firstMonth = first ? monthOf(first.started_at) : null
  const lastMonth = last ? monthOf(last.started_at) : null
  const prevMonth = month && firstMonth && month > firstMonth ? shiftMonth(month, -1) : null
  const nextMonth = month && lastMonth && month < lastMonth ? shiftMonth(month, 1) : null

  return (
    <PaperShell>
      <section className="py-8 sm:py-11 border-b border-ink flex flex-col gap-4 max-w-[860px]">
        <h1 className="m-0 font-cond font-semibold text-[32px] sm:text-[50px] leading-[1.04] tracking-[-0.01em]">Archive</h1>
        <p className="m-0 text-[17px] sm:text-[19px] leading-[1.55]">
          Every edition stays as it was published. One line per day: that evening's lead, the highest level of the day, and how many other
          editions ran.
          {first && ` The first edition ran on ${istShortDate(first.started_at)} ${first.started_at.slice(0, 4)}.`}
        </p>
      </section>

      {!month ? (
        <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">{span.isError ? "Couldn't load the archive." : 'Loading…'}</p>
      ) : (
        <main className="max-w-[1000px] pb-4">
          <div className="flex justify-between items-baseline gap-3 pt-8 pb-2.5 border-b border-ink">
            <h2 className="m-0 font-cond font-semibold text-[24px] sm:text-[30px]">{monthName(month)}</h2>
            <span className="flex gap-4 font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.04em]">
              {prevMonth && (
                <Link to={`/archive?month=${prevMonth}`} className="hover:text-accent">
                  ‹ {monthName(prevMonth)}
                </Link>
              )}
              {nextMonth && (
                <Link to={`/archive?month=${nextMonth}`} className="hover:text-accent">
                  {monthName(nextMonth)} ›
                </Link>
              )}
            </span>
          </div>

          {data.isPending ? (
            <p className="py-6 font-mono text-[12px] uppercase text-ink-muted">Loading…</p>
          ) : data.isError ? (
            <p className="py-6 text-[16px]">Couldn't load {monthName(month)}.</p>
          ) : (
            <ol className="m-0 p-0 list-none">
              {rows.map((r) => (
                <li key={r.day} className="grid grid-cols-[76px_minmax(0,1fr)] sm:grid-cols-[110px_90px_minmax(0,1fr)_150px] gap-x-4 gap-y-1 py-3.5 border-b border-rule items-baseline">
                  <Link to={`/date/${r.day}`} className={`${meta} uppercase hover:text-accent`}>
                    {WEEKDAY.format(new Date(`${r.day}T12:00:00Z`))}
                  </Link>
                  {!r.chosen ? (
                    <span className="sm:col-span-3 text-[15px] text-ink-muted">No edition was published.</span>
                  ) : (
                    <>
                      <span className="hidden sm:flex flex-col gap-1" title={r.max ? `Highest that day: Level ${r.max}` : 'Nothing open that day'}>
                        <Squares level={r.max} />
                        <span className={`${meta} text-ink-muted uppercase`}>{r.max ? LEVEL_NAMES[r.max] : '—'}</span>
                      </span>
                      <Link to={`/date/${r.day}`} className={`text-[16px] sm:text-[17px] leading-[1.4] hover:text-accent ${r.lead?.beforeDesk ? 'text-ink-muted' : ''}`}>
                        {r.lead?.title}
                      </Link>
                      <span className={`${meta} text-ink-muted col-start-2 sm:col-start-auto sm:text-right`}>
                        <span className="sm:hidden">
                          {r.max ? `Highest L${r.max} · ` : ''}
                        </span>
                        <Link to={`/edition/${r.chosen.run.id}`} className="hover:text-accent">
                          No. {r.chosen.run.id} · {slotOf(r.chosen.run.started_at)}
                        </Link>
                        {!r.chosen.evening && <span> · no 20:30{r.chosen.run.id === last?.id ? ' yet' : ''}</span>}
                        {r.chosen.run.status === 'failed' && <span className="text-accent"> · run failed</span>}
                        {r.others > 0 && <span> · +{r.others}</span>}
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}

          <section aria-label="Closed this month" className="flex flex-col gap-3 pt-10">
            <h2 className={head}>
              <span>Closed in {monthName(month)}</span>
              <span className="text-ink-muted tracking-[0.04em]">{closings ? `${numberWord(closings.length)} ${closings.length === 1 ? 'closing' : 'closings'}` : ''}</span>
            </h2>
            {closings && closings.length === 0 && <p className="m-0 text-[15px] text-ink-muted">Nothing closed this month.</p>}
            <ul className="m-0 p-0 list-none">
              {(closings ?? []).map((c) => (
                <li
                  key={`${c.snapshot.item_id}:${c.snapshot.run_id}`}
                  className="grid grid-cols-[76px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-3 border-b border-rule items-baseline"
                >
                  <span className={`${meta} uppercase`}>{WEEKDAY.format(new Date(`${c.closedOn}T12:00:00Z`)).replace(/^\w+ /, '')}</span>
                  <Link to={itemPath(c.snapshot.item_id, c.snapshot.run_id)} className="text-[16px] leading-[1.4] hover:text-accent">
                    {closedSubject(snapshotEntry(c.snapshot))}
                  </Link>
                  <span className={`${meta} text-ink-muted col-start-2 sm:col-start-auto`}>
                    peaked at Level {c.peak} · open {c.daysOpen === 0 ? 'under a day' : `${numberWord(c.daysOpen)} ${c.daysOpen === 1 ? 'day' : 'days'}`} · No.{' '}
                    {c.snapshot.run_id}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </PaperShell>
  )
}
