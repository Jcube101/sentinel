import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useChangeWindow, useEdition, useLatestEditionId } from '@/hooks/useEdition'
import { sinceLabel, sinceYesterday, type Movement } from '@/lib/desk/changes'
import { deskEntries } from '@/lib/desk/entries'
import { changeCounts, headline, levelCounts } from '@/lib/desk/headline'
import { istDate, istShortDate, istTime } from '@/lib/desk/ist'
import { SCALE } from '@/lib/desk/scale'
import { lateNotice, sourceLines } from '@/lib/desk/sources'
import type { Edition } from '@/lib/desk/types'
import PaperShell from '@/components/paper/PaperShell'
import DeskEntryRow from '@/components/paper/DeskEntryRow'
import DeskHero from '@/components/paper/DeskHero'
import NoteBox from '@/components/paper/NoteBox'
import PhoneWire from '@/components/paper/PhoneWire'
import ScalePanel from '@/components/paper/ScalePanel'
import SinceYesterday from '@/components/paper/SinceYesterday'

function EditionLine({ run, latestId }: { run: Edition; latestId: number | null }) {
  const prev = run.id > 1 ? run.id - 1 : null
  const next = latestId !== null && run.id < latestId ? run.id + 1 : null
  return (
    <div className="flex flex-wrap justify-between gap-3 py-2 sm:py-2.5 border-b border-ink font-mono text-[11px] sm:text-[12px] tracking-[0.04em] uppercase">
      <span>
        <span className="hidden sm:inline">
          Report No. {run.id} · {istDate(run.started_at)} · {istTime(run.started_at)} IST run
        </span>
        <span className="sm:hidden">
          No. {run.id} · {istShortDate(run.started_at)} · {istTime(run.started_at)} IST
        </span>
        {run.status === 'failed' && <span className="text-accent font-semibold"> · Run failed</span>}
      </span>
      <span className="flex gap-4">
        {prev !== null && (
          <Link to={`/edition/${prev}`} className="hover:text-accent">
            ‹ No. {prev}
          </Link>
        )}
        {next !== null && (
          <Link to={`/edition/${next}`} className="hover:text-accent">
            No. {next} ›
          </Link>
        )}
      </span>
    </div>
  )
}

function SourceFooter({ run }: { run: Edition }) {
  const lines = sourceLines(run)
  if (lines.length === 0) return null
  return (
    <span title="How old each source's newest data was when this edition was published">
      {lines.map((l, i) => (
        <span key={l.id}>
          {i > 0 && ' · '}
          <span className={l.failed ? 'text-accent font-semibold' : ''}>
            {l.name.toUpperCase()} {l.text}
          </span>
        </span>
      ))}
    </span>
  )
}

function Message({ children }: { children: ReactNode }) {
  return (
    <div className="py-10 text-[17px] sm:text-[19px] leading-[1.55] max-w-[760px]" aria-live="polite">
      {children}
    </div>
  )
}

/** The desk for one edition: `/` shows the latest, `/edition/:n` any edition as published. */
export default function Desk() {
  const params = useParams()
  const requested = params.n === undefined ? null : Number(params.n)
  const badParam = requested !== null && (!Number.isInteger(requested) || requested < 1)

  const latest = useLatestEditionId()
  const latestId = latest.data ?? null
  const id = badParam ? null : (requested ?? latestId)
  const edition = useEdition(id)
  const data = edition.data ?? null
  const finished = data && data.run.status !== 'running' ? data.run : null
  const changeWindow = useChangeWindow(finished)

  const since = useMemo(() => (data && changeWindow.data ? sinceYesterday(data.snapshots, changeWindow.data) : null), [data, changeWindow.data])
  const entries = useMemo(() => {
    if (!data) return []
    // Without the comparison, show no change tags rather than this run's alone.
    const moves = since?.byItem ?? (changeWindow.isError ? new Map<string, Movement>() : undefined)
    return deskEntries(data.snapshots, moves)
  }, [data, since, changeWindow.isError])
  const notice = data ? lateNotice(data.run, data.status) : null

  useEffect(() => {
    document.title = data ? `Sentinel · Report No. ${data.run.id}` : 'Sentinel · Situation report, India'
  }, [data])

  const loading = (
    <Message>
      <span className="font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading the edition…</span>
    </Message>
  )

  let body: ReactNode
  if (!supabase) {
    body = <Message>This site isn't connected to its database: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set.</Message>
  } else if (badParam) {
    body = <Message>There is no edition “{params.n}”. Editions are numbered from 1.</Message>
  } else if (latest.isError || edition.isError) {
    const err = (latest.error ?? edition.error) as Error | null
    body = (
      <Message>
        Couldn't load this edition{err?.message ? `: ${err.message}` : ''}.{' '}
        <button
          type="button"
          onClick={() => (latest.isError ? latest.refetch() : edition.refetch())}
          className="font-mono text-[13px] uppercase border-b border-ink hover:text-accent"
        >
          Try again
        </button>
      </Message>
    )
  } else if (id === null) {
    body = latest.isPending ? loading : <Message>No edition has been published yet.</Message>
  } else if (!data) {
    body = edition.isPending ? (
      loading
    ) : (
      <Message>
        There is no edition No. {id} yet.{' '}
        {latestId !== null && (
          <Link to="/" className="border-b border-ink hover:text-accent">
            The latest is No. {latestId} →
          </Link>
        )}
      </Message>
    )
  } else if (changeWindow.isPending && !changeWindow.isError && data.run.status !== 'running') {
    body = loading
  } else if (data.run.status === 'running') {
    body = (
      <>
        <EditionLine run={data.run} latestId={latestId} />
        <Message>Edition No. {data.run.id} is still being written. It takes a few minutes; this page checks again every minute.</Message>
      </>
    )
  } else {
    const isLatest = data.run.id === latestId
    const noDesk = data.snapshots.length === 0 && data.status.length === 0
    body = (
      <>
        <EditionLine run={data.run} latestId={latestId} />
        {!isLatest && latestId !== null && (
          <NoteBox tag="ARCHIVE">
            You're reading No. {data.run.id}, published {istDate(data.run.started_at)} at {istTime(data.run.started_at)} IST.{' '}
            <Link to="/" className="not-italic font-mono text-[12px] uppercase border-b border-ink hover:text-accent">
              Latest: No. {latestId} →
            </Link>
          </NoteBox>
        )}
        {noDesk ? (
          <Message>
            {data.run.id < SCALE.fromEdition
              ? `This edition ran before the severity desk existed. The desk starts with No. ${SCALE.fromEdition}.`
              : 'No desk was recorded in this edition.'}
          </Message>
        ) : (
          <>
            <DeskHero
              headline={headline(entries, since)}
              counts={levelCounts(entries)}
              changes={since ? (changeCounts(since) ?? 'No change since yesterday') : null}
            />
            {notice && (
              <NoteBox tag="LATE" accent>
                {notice}
              </NoteBox>
            )}
            <div className="flex flex-wrap gap-x-12 gap-y-8 pt-2">
              <main className="flex-[999_1_560px] min-w-0">
                <h2 className="sr-only">On the desk, ranked by severity level, not by count</h2>
                {entries.length === 0 ? (
                  <Message>Nothing is open on the desk in this edition.</Message>
                ) : (
                  entries.map((e, i) => <DeskEntryRow key={e.key} entry={e} rank={i + 1} />)
                )}
              </main>
              <aside className="flex-[1_1_340px] min-w-0 flex flex-col gap-8 sm:pt-6">
                <div className="hidden sm:block">
                  <ScalePanel />
                </div>
                <SinceYesterday
                  label={changeWindow.data ? sinceLabel(changeWindow.data.ref, data.run) : 'Since yesterday'}
                  since={since}
                  error={changeWindow.isError}
                  onRetry={() => changeWindow.refetch()}
                />
              </aside>
              <div className="basis-full sm:hidden">
                <PhoneWire run={data.run} snapshots={data.snapshots} entries={entries} />
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  return <PaperShell footer={data && data.run.status !== 'running' ? <SourceFooter run={data.run} /> : null}>{body}</PaperShell>
}
