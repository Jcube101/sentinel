import type { SinceLine } from '@/lib/desk/copy'

interface Props {
  label: string
  /** null while loading. */
  lines: SinceLine[] | null
  /** The comparison couldn't be loaded: say so, with a retry. */
  error: boolean
  onRetry: () => void
}

function Line({ l }: { l: SinceLine }) {
  const accent = l.kind === 'new' || l.kind === 'reopened'
  const muted = l.kind === 'deescalated' || l.kind === 'closed'
  return (
    <li className={`grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(0,1fr)] gap-3 py-3 border-b border-rule ${muted ? 'text-ink-muted' : ''}`}>
      <span className={`font-mono text-[11px] font-semibold pt-[3px] ${accent ? 'text-accent' : ''}`}>{l.tag}</span>
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] leading-[1.4]">{l.text}</span>
        <span className="font-mono text-[11px] text-ink-muted">{l.levels}</span>
      </span>
    </li>
  )
}

/** How the desk moved since the edition a day earlier (DeskSeverity's sidebar, DeskPhone's list). */
export default function SinceYesterday({ label, lines, error, onRetry }: Props) {
  const open = lines?.filter((l) => l.kind !== 'closed') ?? []
  const closed = lines?.filter((l) => l.kind === 'closed') ?? []
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
      ) : !lines ? (
        <p className="m-0 py-3 font-mono text-[12px] uppercase text-ink-muted">Loading…</p>
      ) : lines.length === 0 ? (
        <p className="m-0 py-3 text-[15px] leading-[1.4] text-ink-muted border-b border-rule">Nothing has changed since then.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {open.map((l) => (
            <Line key={l.key} l={l} />
          ))}
          {closed.length > 0 && (
            <li className="grid grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[84px_minmax(0,1fr)] gap-3 py-3 border-b border-rule text-ink-muted">
              <span className="font-mono text-[11px] font-semibold pt-[3px]">− CLOSED</span>
              <details className="group min-w-0">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden text-[15px] leading-[1.4]">
                  {closed.length} {closed.length === 1 ? 'item' : 'items'} ·{' '}
                  <span className="border-b border-ink-muted group-open:hidden">show</span>
                  <span className="border-b border-ink-muted hidden group-open:inline">hide</span>
                </summary>
                <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-2">
                  {closed.map((l) => (
                    <li key={l.key} className="flex flex-col gap-0.5">
                      <span className="text-[15px] leading-[1.4]">{l.text}</span>
                      <span className="font-mono text-[11px]">{l.levels}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
