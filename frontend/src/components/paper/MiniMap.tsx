import { Link } from 'react-router-dom'
import PaperMap, { type FirePoint, type MapItem } from './PaperMap'

interface Props {
  items: MapItem[]
  fires: FirePoint[]
  /** The full map, opened at this edition and item. */
  to: string
  selected?: string | null
  note?: string | null
}

/** A small, still map of the edition's items and fires (the Desk's and the item page's sidebar). */
export default function MiniMap({ items, fires, to, selected = null, note = null }: Props) {
  return (
    <section aria-label="The map">
      <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink">The map</h2>
      <div className="mt-3.5 h-[280px] sm:h-[320px] border border-rule">
        <PaperMap items={items} fires={fires} interactive={false} zoom={4} selected={selected} className="h-full w-full" />
      </div>
      {note && <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted">{note}</p>}
      <Link to={to} className="inline-block mt-2.5 pt-3 pb-0.5 font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent">
        Open the map →
      </Link>
    </section>
  )
}
