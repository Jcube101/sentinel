import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import type { FirePoint, MapItem } from './PaperMap'
import type { AirPoint } from './mapSymbols'

// Leaflet loads after the page's words: the map is the sidebar, not the story.
const PaperMap = lazy(() => import('./PaperMap'))

interface Props {
  items: MapItem[]
  fires: FirePoint[]
  /** The full map, opened at this edition and item. */
  to: string
  selected?: string | null
  note?: string | null
  /** Air squares (the air item's page). */
  air?: AirPoint[]
}

/** A small, still map of the edition's items and fires (the Desk's and the item page's sidebar). */
export default function MiniMap({ items, fires, to, selected = null, note = null, air = [] }: Props) {
  return (
    <section aria-label="The map">
      <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink">The map</h2>
      <div className="mt-3.5 h-[280px] sm:h-[320px] border border-rule bg-panel" role="img" aria-label="A small map of India with the report's items and the day's fires">
        <Suspense fallback={null}>
          <PaperMap items={items} fires={fires} air={air} interactive={false} zoom={4} selected={selected} className="h-full w-full" />
        </Suspense>
      </div>
      {note && <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">{note}</p>}
      <Link to={to} className="inline-block mt-2.5 pt-3 pb-0.5 font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent">
        Open the map →
      </Link>
    </section>
  )
}
