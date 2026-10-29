import { useEffect, useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useEdition, useLatestEditionId, useRunSources } from '@/hooks/useEdition'
import { istDate, istShortDate, istTime } from '@/lib/desk/ist'
import { CATEGORY_NAMES } from '@/lib/desk/levels'
import {
  CATEGORY_SOURCE_MAP,
  CELL_WORDS,
  SOURCE_NAMES,
  SOURCE_ORDER,
  SOURCE_ROLES,
  SOURCE_TITLES,
  cellState,
  sourceLines,
  type CellState,
} from '@/lib/desk/sources'
import { scaleFrom } from '@/lib/desk/scale'
import type { Edition } from '@/lib/desk/types'
import { lastKnownWords } from '@/lib/desk/words'
import PaperShell from '@/components/paper/PaperShell'

const head = 'm-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink flex justify-between gap-3'
const th = 'py-1.5 pr-3 font-normal text-[10px] uppercase tracking-[0.05em] text-ink-muted text-left'
const td = 'py-2 pr-3 align-top'
const num = `${td} whitespace-nowrap`

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 pt-8">
      <h2 className={head}>
        <span>{title}</span>
        {right && <span className="text-ink-muted tracking-[0.04em]">{right}</span>}
      </h2>
      {children}
    </section>
  )
}

const CELL_STYLE: Record<CellState, string> = {
  new: 'bg-ink',
  same: 'bg-fill-strong',
  empty: 'border border-dashed border-ink-muted',
  failed: 'bg-accent',
  none: 'bg-fill opacity-50',
}

/** How each source answered in the edition: from that run's own record. */
function ThisRun({ run }: { run: Edition }) {
  const lines = new Map(sourceLines(run).map((l) => [l.id, l]))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse font-mono text-[12px] sm:text-[13px] leading-[1.4]">
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className={th}>Source</th>
            <th scope="col" className={th}>What it gives</th>
            <th scope="col" className={th}>Answer</th>
            <th scope="col" className={th}>Newest data</th>
            <th scope="col" className={`${th} text-right`}>Rows</th>
            <th scope="col" className={`${th} text-right`}>Took</th>
          </tr>
        </thead>
        <tbody>
          {SOURCE_ORDER.map((id) => {
            const r = run.sources?.[id]
            const state = cellState(r)
            const line = lines.get(id)
            return (
              <tr key={id} className="border-b border-rule">
                <th scope="row" className={`${td} font-normal text-left text-ink`}>
                  {SOURCE_TITLES[id]}
                </th>
                <td className={`${td} font-serif text-[14px] text-ink-muted`}>{SOURCE_ROLES[id]}</td>
                <td className={`${num} ${state === 'failed' || state === 'empty' ? 'text-accent font-semibold' : ''}`}>{CELL_WORDS[state]}</td>
                <td className={num}>{line && !line.failed ? line.words : '—'}</td>
                <td className={`${num} text-right`}>{r?.rows?.toLocaleString('en-IN') ?? '—'}</td>
                <td className={`${num} text-right`}>{typeof r?.duration_s === 'number' ? `${Math.round(r.duration_s)} s` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** One row per source, one cell per edition: how each answered, over 21 editions. */
function Grid({ runs, current, latestId }: { runs: Edition[]; current: number; latestId: number | null }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-collapse font-mono text-[11px]" aria-label="How each source answered in each edition">
          <thead>
            <tr>
              <th scope="col" className="sr-only">Source</th>
              {runs.map((r) => (
                <th key={r.id} scope="col" className={`px-[1px] pb-1 font-normal text-[10px] ${r.id === current ? 'text-ink font-semibold' : 'text-ink-muted'}`}>
                  <Link to={r.id === latestId ? '/sources' : `/sources?edition=${r.id}`} className="hover:text-accent">
                    {r.id}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SOURCE_ORDER.map((id) => (
              <tr key={id}>
                <th scope="row" className="pr-3 py-[2px] font-normal text-left whitespace-nowrap">
                  {SOURCE_NAMES[id]}
                </th>
                {runs.map((r) => {
                  const state = cellState(r.sources?.[id])
                  return (
                    <td key={r.id} className="px-[1px] py-[2px]">
                      <span
                        title={`No. ${r.id}, ${istShortDate(r.started_at)} ${istTime(r.started_at)}: ${CELL_WORDS[state]}`}
                        className={`block w-[18px] h-[18px] box-border ${CELL_STYLE[state]} ${r.id === current ? 'outline outline-1 outline-offset-1 outline-ink' : ''}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className="pr-3 pt-1 font-normal text-left text-ink-muted whitespace-nowrap">Edition</th>
              {runs.map((r) => (
                <td key={r.id} className="px-[1px] pt-1 text-center text-[10px]">
                  {r.status === 'failed' ? <span className="text-accent font-semibold" title="The run failed">!</span> : ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <ul className="m-0 p-0 list-none flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] text-ink-muted">
        {(['new', 'same', 'empty', 'failed', 'none'] as CellState[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 box-border ${CELL_STYLE[s]}`} /> {CELL_WORDS[s]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="text-accent font-semibold">!</span> run failed
        </li>
      </ul>
    </div>
  )
}

/** Sources: where the figures come from, and how each source answered. */
export default function Sources() {
  const [search] = useSearchParams()
  const asked = search.get('edition')
  const editionParam = asked && /^\d+$/.test(asked) ? Number(asked) : null
  const latest = useLatestEditionId()
  const latestId = latest.data ?? null
  const edition = useEdition(editionParam ?? latestId)
  const run = edition.data?.run ?? null
  const runs = useRunSources(run)
  const scale = useMemo(() => (run ? scaleFrom(run.severity_config) : undefined), [run])

  useEffect(() => {
    document.title = 'Sentinel · Sources'
  }, [])

  return (
    <PaperShell scale={scale}>
      <section className="py-8 sm:py-11 border-b border-ink flex flex-col gap-4 max-w-[860px]">
        <h1 className="m-0 font-cond font-semibold text-[32px] sm:text-[50px] leading-[1.04] tracking-[-0.01em]">Sources</h1>
        <p className="m-0 text-[17px] sm:text-[19px] leading-[1.55]">
          Every figure comes from one of six public sources, read three times a day. Here is how each one answered, and which part of the
          picture depends on it. When a source doesn't answer, its items keep their last known figures and say so.
        </p>
      </section>
      {!run ? (
        <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">{edition.isError ? "Couldn't load the sources." : 'Loading…'}</p>
      ) : (
        <main className="max-w-[1100px] pb-4">
          <Section
            title={`In No. ${run.id}`}
            right={
              <>
                {istDate(run.started_at)}, {istTime(run.started_at)} IST{run.status === 'failed' && <span className="text-accent font-semibold"> · run failed</span>}
              </>
            }
          >
            <ThisRun run={run} />
            <p className="m-0 font-mono text-[11px] text-ink-muted">
              Newest data is the age of each source's newest observation when the edition was published. Sources that report events as
              they happen (earthquakes, disaster alerts, NASA's event tracker) often have nothing new: that is normal for them.
            </p>
          </Section>

          <Section title="What each part depends on" right={`as of No. ${run.id}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[15px] leading-[1.45]">
                <thead>
                  <tr className="border-b border-rule">
                    <th scope="col" className={th}>Part</th>
                    <th scope="col" className={th}>Reads</th>
                    <th scope="col" className={th}>In No. {run.id}</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_SOURCE_MAP.map((c) => {
                    const st = edition.data?.status.find((s) => s.category === c.category)
                    const note = st?.last_known ? (st.summary.split(' · last known: ')[1] ?? null) : null
                    const used = st?.source && st.source !== c.main ? st.source : null
                    return (
                      <tr key={c.category} className="border-b border-rule">
                        <th scope="row" className={`${td} font-cond font-semibold text-[17px] text-left`}>{CATEGORY_NAMES[c.category]}</th>
                        <td className={td}>
                          {SOURCE_TITLES[c.main]}
                          {c.also && (
                            <span className="text-ink-muted">
                              {c.category === 'air' ? '; if it is down, ' : '; also '}
                              {SOURCE_TITLES[c.also]}
                              {c.category === 'fire' ? ' for forest-fire alerts' : ''}
                            </span>
                          )}
                        </td>
                        <td className={`${td} ${st?.last_known ? 'text-accent' : ''}`}>
                          {!st
                            ? '—'
                            : st.last_known
                              ? `Last known: ${lastKnownWords(note)}`
                              : used
                                ? `Up to date, from ${SOURCE_NAMES[used] ?? used}`
                                : 'Up to date'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="The last 21 editions" right="each source, each edition">
            {runs.data ? <Grid runs={runs.data} current={run.id} latestId={latestId} /> : <p className="m-0 font-mono text-[12px] text-ink-muted">Loading…</p>}
          </Section>

          <p className="m-0 pt-8 text-[15px] leading-[1.55] text-ink-muted">
            Licences and acknowledgements for each source are on the{' '}
            <Link to="/about" className="border-b border-ink-muted hover:text-accent">
              About
            </Link>{' '}
            page.
          </p>
        </main>
      )}
    </PaperShell>
  )
}
