import { useEffect } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useItemForEvent } from '@/hooks/useEdition'
import { itemPath } from '@/lib/desk/paths'
import PaperShell from '@/components/paper/PaperShell'

const link = 'font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink pb-0.5 hover:text-accent'

/**
 * `/event/:id`, the old site's event pages: on to the desk item the event
 * became, else a short note with the way to today's report and the map.
 */
export default function EventRedirect() {
  const { id } = useParams()
  const item = useItemForEvent(id ?? null)

  useEffect(() => {
    document.title = 'Sentinel · An event from the old site'
  }, [])

  if (item.data) return <Navigate to={itemPath(item.data)} replace />
  return (
    <PaperShell>
      <section className="py-9 sm:py-11 border-b border-ink flex flex-col gap-4 max-w-[820px]" aria-live="polite">
        {item.isPending && !item.isError ? (
          <p className="m-0 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Finding this event…</p>
        ) : (
          <>
            <h1 className="m-0 font-cond font-semibold text-[30px] sm:text-[50px] leading-[1.04] tracking-[-0.01em]">An event from the old site</h1>
            <p className="m-0 text-[17px] sm:text-[19px] leading-[1.55]">
              {item.isError
                ? "This link is from Sentinel's old event pages, and the lookup didn't work just now."
                : "This link is from Sentinel's old event pages. That event never became one of the report's items: fires are now reported state by state, and NASA's event tracker isn't given levels."}
            </p>
            <p className="m-0 flex flex-wrap gap-5 pt-1">
              <Link to="/" className={link}>
                Today's report →
              </Link>
              <Link to="/map" className={link}>
                The map →
              </Link>
            </p>
          </>
        )}
      </section>
    </PaperShell>
  )
}
