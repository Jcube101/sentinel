import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDayRuns, useLatestEditionId } from '@/hooks/useEdition'
import { chooseDayEdition, parseDay, slotOf } from '@/lib/desk/archive'
import { istDate, istDay, istShortDate } from '@/lib/desk/ist'
import PaperShell from '@/components/paper/PaperShell'
import NoteBox from '@/components/paper/NoteBox'
import Desk from './Desk'

const link = 'not-italic font-mono text-[12px] uppercase border-b border-ink hover:text-accent'

function Message({ children }: { children: ReactNode }) {
  return (
    <PaperShell>
      <div className="py-10 text-[17px] sm:text-[19px] leading-[1.55] max-w-[760px] flex flex-col gap-4">{children}</div>
    </PaperShell>
  )
}

/** `/date/YYYY-MM-DD`: the day's 20:30 edition (else its latest), with the day's other editions. */
export default function DatePage() {
  const { day: param } = useParams()
  const day = parseDay(param)
  const latest = useLatestEditionId()
  const runs = useDayRuns(day)

  useEffect(() => {
    if (day) document.title = `Sentinel · ${istDate(`${day}T06:30:00Z`)}`
  }, [day])

  if (!day) return <Message>There is no day “{param}”. Days are written like 2026-10-28.</Message>
  if (runs.isPending) {
    return (
      <Message>
        <span className="font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading the day…</span>
      </Message>
    )
  }
  if (runs.isError || !runs.data) return <Message>Couldn't load {day}.</Message>

  const { prev, next } = runs.data
  const dayName = istDate(`${day}T06:30:00Z`)
  const prevDay = prev ? istDay(prev.started_at) : null
  const nextDay = next ? istDay(next.started_at) : null
  const chosen = chooseDayEdition(runs.data.runs)

  if (!chosen) {
    return (
      <Message>
        <p className="m-0">No edition was published on {dayName}.</p>
        <p className="m-0 flex flex-wrap gap-5">
          {prevDay && (
            <Link to={`/date/${prevDay}`} className={link}>
              ‹ {istShortDate(prev!.started_at)}
            </Link>
          )}
          {nextDay && (
            <Link to={`/date/${nextDay}`} className={link}>
              {istShortDate(next!.started_at)} ›
            </Link>
          )}
          <Link to="/archive" className={link}>
            The archive →
          </Link>
        </p>
      </Message>
    )
  }

  const { run, evening } = chosen
  const others = runs.data.runs.filter((r) => r.id !== run.id)
  const isToday = latest.data !== undefined && runs.data.runs.some((r) => r.id === latest.data)
  const lead = evening
    ? `${dayName}: the 20:30 edition, No. ${run.id}.`
    : `No 20:30 edition ${isToday ? 'yet' : 'on this day'}; this is the ${slotOf(run.started_at)}, No. ${run.id}.`

  const note = (
    <NoteBox tag="DAY">
      {lead}{' '}
      {others.length > 0 && (
        <>
          Also that day:{' '}
          {others.map((r, i) => (
            <span key={r.id}>
              {i > 0 && ', '}
              <Link to={`/edition/${r.id}`} className={link}>
                No. {r.id} · {slotOf(r.started_at)}
              </Link>
            </span>
          ))}
          .{' '}
        </>
      )}
      <span className="inline-flex flex-wrap gap-4 not-italic">
        {prevDay && (
          <Link to={`/date/${prevDay}`} className={link}>
            ‹ {istShortDate(prev!.started_at)}
          </Link>
        )}
        {nextDay && (
          <Link to={`/date/${nextDay}`} className={link}>
            {istShortDate(next!.started_at)} ›
          </Link>
        )}
      </span>
    </NoteBox>
  )
  return <Desk editionId={run.id} dayNote={note} />
}
