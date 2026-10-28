import type { ReactNode } from 'react'

interface Props {
  /** Short mono tag on the left, e.g. "LATE". */
  tag: string
  children: ReactNode
  accent?: boolean
}

/** The shaded note from the phone mockup ("LATE · OpenAQ's pull came back empty"). */
export default function NoteBox({ tag, children, accent = false }: Props) {
  return (
    <div className="flex gap-2.5 items-start px-3.5 py-3 mt-4 bg-note text-[14px] leading-[1.45]">
      <span className={`font-mono text-[11px] font-semibold pt-0.5 flex-none ${accent ? 'text-accent' : ''}`}>{tag}</span>
      <span className="italic">{children}</span>
    </div>
  )
}
