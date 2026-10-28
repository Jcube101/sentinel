import type { DeskNote } from '@/lib/desk/notes'
import LevelSquares from './LevelSquares'

/** Notes at the foot of the page: each caveat said once, out of the stories. */
export default function PageNotes({ notes }: { notes: DeskNote[] }) {
  if (notes.length === 0) return null
  return (
    <section aria-label="Notes" className="mt-12 pt-3 border-t border-ink flex flex-col gap-2.5">
      <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] uppercase tracking-[0.08em]">Notes</h2>
      <ul className="m-0 p-0 list-none flex flex-col gap-2 max-w-[760px]">
        {notes.map((n) => (
          <li key={n.key} className="flex gap-2.5 items-baseline text-[14px] leading-[1.5] text-ink-muted">
            {n.squares && (
              <span className="flex-none relative top-[1px]">
                <LevelSquares level={n.squares.level} wouldBe={n.squares.wouldBe} />
              </span>
            )}
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
