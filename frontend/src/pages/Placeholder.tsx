import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import PaperShell from '@/components/paper/PaperShell'

interface Props {
  title: string
  /** What the page will hold, one line. */
  line: string
}

/** A one-line page: the not-found page. */
export default function Placeholder({ title, line }: Props) {
  useEffect(() => {
    document.title = `Sentinel · ${title}`
  }, [title])
  return (
    <PaperShell>
      <section className="py-9 sm:py-11 border-b border-ink flex flex-col gap-4 max-w-[820px]">
        <h1 className="m-0 font-cond font-semibold text-[30px] sm:text-[50px] leading-[1.04] tracking-[-0.01em]">{title}</h1>
        <p className="m-0 text-[17px] sm:text-[19px] leading-[1.55]">{line}</p>
        <Link to="/" className="self-start font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink pt-3 pb-0.5 hover:text-accent">
          ← Back to the desk
        </Link>
      </section>
    </PaperShell>
  )
}
