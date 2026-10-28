import { LEVEL_NAMES } from '@/lib/desk/levels'
import type { Level } from '@/lib/desk/types'

interface Props {
  headline: string
  counts: Record<Level, number>
  /** "1 new · 2 escalated · 3 closed", "No change since yesterday", or null while unknown. */
  changes: string | null
}

const ORDER: Level[] = [4, 3, 2, 1]

/** The headline and the level counts, as at the top of DeskSeverity and DeskPhone. */
export default function DeskHero({ headline, counts, changes }: Props) {
  return (
    <section className="pt-6 pb-5 sm:pt-9 sm:pb-7 border-b border-ink flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-8 sm:items-end sm:justify-between">
      <h1 className="m-0 font-cond font-semibold text-[30px] sm:text-[50px] leading-[1.06] sm:leading-[1.04] tracking-[-0.01em] max-w-[860px]">
        {headline}
      </h1>
      <div className="flex flex-col gap-2 sm:gap-2.5 font-mono">
        <dl className="m-0 grid grid-cols-4 sm:grid-cols-[repeat(4,minmax(72px,auto))]">
          {ORDER.map((level, i) => (
            <div
              key={level}
              className={`flex flex-col-reverse gap-0.5 sm:gap-1 ${i === 0 ? 'pr-3 sm:pr-4' : 'px-3 sm:px-4 border-l border-rule'}`}
            >
              <dt className="text-[10px] sm:text-[11px] tracking-[0.08em] uppercase">{LEVEL_NAMES[level]}</dt>
              <dd
                className={`m-0 text-[26px] sm:text-[34px] font-semibold leading-none ${
                  level === 4 && counts[4] > 0 ? 'text-accent' : level === 1 || counts[level] === 0 ? 'text-ink-muted' : ''
                }`}
              >
                {counts[level]}
              </dd>
            </div>
          ))}
        </dl>
        {changes && <div className="text-[11px] sm:text-[12px] text-ink-muted uppercase">{changes}</div>}
      </div>
    </section>
  )
}
