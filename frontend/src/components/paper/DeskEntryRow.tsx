import { CATEGORY_NAMES, LEVEL_NAMES } from '@/lib/desk/levels'
import type { DeskEntry, DeskLabel } from '@/lib/desk/entries'
import type { Change } from '@/lib/desk/types'
import LevelSquares from './LevelSquares'

const CHANGE_TEXT: Record<Change, string> = {
  opened: '+ New',
  reopened: '+ Reopened',
  escalated: '▲ Escalated',
  deescalated: '▼ De-escalated',
  closed: '− Closed',
}

const TITLE_SIZE = {
  4: 'text-[23px] sm:text-[32px] leading-[1.1]',
  3: 'text-[22px] sm:text-[30px] leading-[1.1]',
  2: 'text-[21px] sm:text-[28px] leading-[1.12]',
  1: 'text-[18px] sm:text-[23px] leading-[1.18]',
} as const

const LABEL_STYLE: Record<DeskLabel['kind'], string> = {
  unvalidated: 'border border-ink',
  approximate: 'border border-accent text-accent',
  cap: 'border border-dashed border-ink',
}

function Chips({ entry }: { entry: DeskEntry }) {
  const isNew = entry.change === 'opened' || entry.change === 'reopened'
  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-[12px] tracking-[0.06em] uppercase">
      <span className={`px-[7px] sm:px-2 py-[3px] ${entry.level === 4 ? 'bg-accent text-white' : 'bg-ink text-paper'}`}>
        <span className="sm:hidden">L{entry.level}</span>
        <span className="hidden sm:inline">Level {entry.level}</span> · {LEVEL_NAMES[entry.level]}
      </span>
      <span className="border border-ink px-[7px] sm:px-2 py-0.5">{CATEGORY_NAMES[entry.category]}</span>
      {entry.change && (
        <span
          className={`px-[7px] sm:px-2 py-0.5 border ${isNew ? 'border-accent text-accent font-semibold' : 'border-ink'}`}
        >
          {CHANGE_TEXT[entry.change]}
        </span>
      )}
      {entry.labels.map((l) => (
        <span key={l.kind} className={`px-[7px] sm:px-2 py-0.5 ${LABEL_STYLE[l.kind]}`}>
          {l.text}
        </span>
      ))}
    </div>
  )
}

/** Level 1 rows are compact: one muted line instead of chips. */
function MinorLine({ entry }: { entry: DeskEntry }) {
  const parts = [`Level 1 · ${LEVEL_NAMES[1]}`, CATEGORY_NAMES[entry.category]]
  if (entry.members.length > 0) parts.push(`${entry.members.length} in this edition`)
  else parts.push(entry.change ? CHANGE_TEXT[entry.change] : 'Steady')
  return (
    <div className="font-mono text-[10px] sm:text-[12px] tracking-[0.06em] uppercase text-ink-muted">
      {parts.join(' · ')}
      {entry.newMembers > 0 && <span className="text-accent font-semibold"> · + {entry.newMembers} new</span>}
      {entry.labels.map((l) => (
        <span key={l.kind}> · {l.text}</span>
      ))}
    </div>
  )
}

interface Props {
  entry: DeskEntry
  rank: number
}

/** One item on the desk, as in the DeskSeverity and DeskPhone mockups. */
export default function DeskEntryRow({ entry, rank }: Props) {
  const major = entry.level >= 2
  const meta = 'font-mono text-[11px] sm:text-[12px] leading-[1.5]'
  return (
    <article className={`flex gap-3.5 sm:gap-6 border-b border-ink ${major ? 'py-5 sm:pt-6 sm:pb-[26px]' : 'py-3.5 sm:py-5'}`}>
      <div className="flex flex-col gap-2 sm:gap-2.5 w-10 sm:w-[52px] flex-none">
        <span
          className={`font-cond font-bold leading-[0.9] ${major ? 'text-[40px] sm:text-[56px]' : 'text-[26px] sm:text-[40px]'} ${
            entry.level === 4 ? 'text-accent' : ''
          }`}
        >
          {rank}
        </span>
        <LevelSquares level={entry.level} wouldBe={entry.wouldBe} />
      </div>
      <div className={`flex flex-col min-w-0 flex-1 ${major ? 'gap-2.5' : 'gap-1.5 sm:gap-2'}`}>
        {major ? <Chips entry={entry} /> : <MinorLine entry={entry} />}
        <h2 className={`m-0 font-cond font-semibold ${TITLE_SIZE[entry.level]}`}>{entry.title}</h2>
        {entry.members.length > 0 && (
          <ul className={`${meta} m-0 p-0 list-none`}>
            {entry.members.map((m) => (
              <li key={m.key}>
                {m.title}
                {m.lastKnown && <span className="text-accent"> · last known</span>}
              </li>
            ))}
          </ul>
        )}
        <p className={`${meta} m-0 text-ink-muted`}>
          <span className="uppercase tracking-[0.04em]">Level from:</span> {entry.reason}
        </p>
        {entry.notes.map((n) => (
          <p key={n.text} className={`${meta} m-0 text-ink-muted`}>
            {n.text}
          </p>
        ))}
        {entry.lastKnown && (
          <p className={`${meta} m-0 text-accent font-semibold uppercase tracking-[0.04em]`}>
            Last-known · {entry.lastKnownWhy ?? 'its source did not answer in this run'}
          </p>
        )}
      </div>
    </article>
  )
}
