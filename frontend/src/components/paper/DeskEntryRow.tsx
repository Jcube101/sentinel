import { CATEGORY_NAMES, LEVEL_NAMES } from '@/lib/desk/levels'
import { entryCard, type Card, type FireRow } from '@/lib/desk/cards'
import { quakeMemberLine, type ItemCopy } from '@/lib/desk/copy'
import type { DeskEntry, DeskLabel } from '@/lib/desk/entries'
import type { Change } from '@/lib/desk/types'
import { lastKnownWords } from '@/lib/desk/words'
import LevelSquares from './LevelSquares'

const CHANGE_TEXT: Record<Change, string> = {
  opened: '+ New',
  reopened: '+ Back',
  escalated: '▲ Up',
  deescalated: '▼ Down',
  closed: '− Closed',
}

const TITLE_SIZE = {
  4: 'text-[24px] sm:text-[32px] leading-[1.1]',
  3: 'text-[23px] sm:text-[30px] leading-[1.1]',
  2: 'text-[22px] sm:text-[28px] leading-[1.12]',
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
        <span className={`px-[7px] sm:px-2 py-0.5 border ${isNew ? 'border-accent text-accent font-semibold' : 'border-ink'}`}>
          {CHANGE_TEXT[entry.change]}
        </span>
      )}
      {entry.members.length > 0 && entry.newMembers > 0 && (
        <span className="px-[7px] sm:px-2 py-0.5 border border-accent text-accent font-semibold">+ {entry.newMembers} new</span>
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
  if (entry.change) parts.push(CHANGE_TEXT[entry.change])
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

const meta = 'font-mono text-[11px] sm:text-[12px] leading-[1.5]'

/** The figures strip: exact numbers, set small (three cells on phones). */
function Strip({ card }: { card: Card }) {
  return (
    <dl className="m-0 grid grid-flow-col auto-cols-fr border-t border-rule max-w-[640px]">
      {card.cells.map((c, i) => (
        <div
          key={c.label}
          className={`${c.wideOnly ? 'hidden sm:flex' : 'flex'} flex-col-reverse justify-end gap-0.5 pt-2 min-w-0 ${
            i === 0 ? 'pr-2 sm:pr-3' : 'px-2 sm:px-3 border-l border-rule'
          }`}
        >
          <dt className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink-muted">
            <span className="sm:hidden">{c.short ?? c.label}</span>
            <span className="hidden sm:inline">{c.label}</span>
          </dt>
          <dd className="m-0 font-mono text-[14px] sm:text-[15px] font-semibold leading-[1.2] whitespace-nowrap">{c.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The fire roundup's state table: the evidence under the story. */
function StateTable({ rows, day }: { rows: FireRow[]; day: string | null }) {
  const held = rows.filter((r) => r.wouldBe !== null)
  const th = 'py-1.5 pr-3 font-normal text-left text-[10px] uppercase tracking-[0.05em]'
  return (
    <div className="max-w-[640px]">
      <table className="w-full border-collapse border-t border-rule font-mono text-[12px] sm:text-[13px] leading-[1.35]">
        <thead>
          <tr className="border-b border-rule">
            <th scope="col" className={th}>State</th>
            <th scope="col" className={`${th} text-right`}>Fires{day ? `, ${day}` : ''}</th>
            <th scope="col" className={`${th} text-right`}>Usual a day</th>
            <th scope="col" className={`${th} pl-3 pr-0`}>Vs past years</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-rule">
              <th scope="row" className="py-1.5 pr-3 font-normal text-left text-ink">
                {r.state}
                {r.wouldBe !== null && '*'}
              </th>
              <td className="py-1.5 pr-3 text-right text-ink font-semibold">{r.fires}</td>
              <td className="py-1.5 pr-3 text-right">{r.usual}</td>
              <td className={`py-1.5 pl-3 ${r.vsPast.startsWith('busiest') ? 'text-ink font-semibold' : ''}`}>{r.vsPast}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {held.length > 0 && (
        <p className="m-0 pt-1 font-mono text-[11px]">
          * Held at Level {held[0].level} for now; would be {held[0].wouldBe}.
        </p>
      )}
    </div>
  )
}

interface Props {
  entry: DeskEntry
  copy: ItemCopy
  rank: number
}

/** One item on the desk: the story first, the evidence under it. */
export default function DeskEntryRow({ entry, copy, rank }: Props) {
  const major = entry.level >= 2
  const card = entryCard(entry)
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
        <h2 className={`m-0 font-cond font-semibold ${TITLE_SIZE[entry.level]}`}>{copy.title}</h2>
        {major && copy.standfirst && (
          <p className="m-0 text-[16px] sm:text-[18px] leading-[1.55] max-w-[760px]">{copy.standfirst}</p>
        )}
        {entry.members.length > 0 && entry.category === 'earthquake' && (
          <ul className="m-0 p-0 list-none text-[15px] leading-[1.45]">
            {entry.members.map((m) => (
              <li key={m.key}>
                {quakeMemberLine(m)}
                {m.lastKnown && <span className="text-accent"> · last known</span>}
              </li>
            ))}
          </ul>
        )}
        <div className={`flex flex-col gap-1.5 text-ink-muted ${major ? 'pt-1' : ''}`}>
          {card && card.cells.length > 0 && <Strip card={card} />}
          {card?.table && <StateTable rows={card.table} day={card.tableDay ?? null} />}
          <p className={`${meta} m-0`}>
            <span className="uppercase tracking-[0.04em]">Level from:</span> {entry.reason}
            {card?.link && (
              <>
                {' · '}
                <a
                  href={card.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="uppercase tracking-[0.04em] border-b border-ink-muted hover:text-accent hover:border-accent"
                >
                  {card.link.text} ↗
                </a>
              </>
            )}
          </p>
          {card?.detail && <p className={`${meta} m-0`}>{card.detail}</p>}
          {entry.notes.map((n) => (
            <p key={n.text} className={`${meta} m-0`}>
              {n.text}
            </p>
          ))}
        </div>
        {entry.lastKnown && (
          <p className={`${meta} m-0 text-accent font-semibold`}>
            <span className="uppercase tracking-[0.04em]">Last known:</span> {lastKnownWords(entry.lastKnownWhy)}
          </p>
        )}
      </div>
    </article>
  )
}
