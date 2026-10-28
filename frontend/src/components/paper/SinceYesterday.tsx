import type { ReactNode } from 'react'
import { editionTitle } from '@/lib/desk/entries'
import { LEVEL_NAMES } from '@/lib/desk/levels'
import type { Movement, SinceYesterday as Since } from '@/lib/desk/changes'

interface Props {
  label: string
  since: Since | null
  /** The comparison couldn't be loaded: say so, with a retry. */
  error: boolean
  onRetry: () => void
}

function Row({ tag, accent, muted, children }: { tag: string; accent?: boolean; muted?: boolean; children: ReactNode }) {
  return (
    <li
      className={`grid grid-cols-[84px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)] gap-3 py-3 border-b border-rule text-[15px] leading-[1.4] ${
        muted ? 'text-ink-muted' : ''
      }`}
    >
      <span className={`font-mono text-[11px] font-semibold pt-[3px] ${accent ? 'text-accent' : ''}`}>{tag}</span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

function line(m: Movement): { tag: string; text: string; accent?: boolean; muted?: boolean } {
  const title = editionTitle(m.snapshot)
  switch (m.kind) {
    case 'new':
      return { tag: '+ NEW', text: `${title}, at Level ${m.to} · ${LEVEL_NAMES[m.to!]}`, accent: true }
    case 'reopened':
      return { tag: '+ REOPENED', text: `${title}, back at Level ${m.to}`, accent: true }
    case 'escalated':
      return { tag: `▲ ${m.from} → ${m.to}`, text: title }
    case 'deescalated':
      return { tag: `▼ ${m.from} → ${m.to}`, text: title, muted: true }
    case 'closed':
      return { tag: '− CLOSED', text: title, muted: true }
  }
}

/** How the desk moved since the edition a day earlier (DeskSeverity's sidebar, DeskPhone's list). */
export default function SinceYesterday({ label, since, error, onRetry }: Props) {
  const open = since?.moves.filter((m) => m.kind !== 'closed') ?? []
  const closed = since?.moves.filter((m) => m.kind === 'closed') ?? []
  return (
    <section aria-label={label}>
      <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink">
        {label}
      </h2>
      {error ? (
        <p className="m-0 py-3 text-[15px] leading-[1.4]">
          Couldn't load the changes since yesterday.{' '}
          <button type="button" onClick={onRetry} className="font-mono text-[12px] uppercase border-b border-ink hover:text-accent">
            Try again
          </button>
        </p>
      ) : !since ? (
        <p className="m-0 py-3 font-mono text-[12px] uppercase text-ink-muted">Loading…</p>
      ) : since.moves.length === 0 ? (
        <p className="m-0 py-3 text-[15px] leading-[1.4] text-ink-muted border-b border-rule">No change since then.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {open.map((m) => {
            const l = line(m)
            return (
              <Row key={m.itemId} tag={l.tag} accent={l.accent} muted={l.muted}>
                {l.text}
              </Row>
            )
          })}
          {closed.length > 0 && (
            <Row tag="− CLOSED" muted>
              <details className="group">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  {closed.length} {closed.length === 1 ? 'item' : 'items'} ·{' '}
                  <span className="border-b border-ink-muted group-open:hidden">show</span>
                  <span className="border-b border-ink-muted hidden group-open:inline">hide</span>
                </summary>
                <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1.5">
                  {closed.map((m) => (
                    <li key={m.itemId}>
                      {editionTitle(m.snapshot)}
                      <span className="font-mono text-[11px]"> · was L{m.from}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </Row>
          )}
        </ul>
      )}
    </section>
  )
}
