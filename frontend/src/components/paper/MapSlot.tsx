import { Link } from 'react-router-dom'

/** The sidebar's map: a placeholder until the map step (plan step 6). */
export default function MapSlot() {
  return (
    <section aria-label="The map">
      <h2 className="m-0 font-mono font-normal text-[11px] sm:text-[12px] tracking-[0.08em] uppercase pb-2 sm:pb-2.5 border-b border-ink">The map</h2>
      <div className="mt-3.5 h-[180px] sm:h-[240px] border border-dashed border-fill-strong bg-panel flex items-center justify-center p-6 text-center">
        <p className="m-0 text-[14px] leading-[1.5] text-ink-muted max-w-[260px]">A map of this report's items comes with the map page.</p>
      </div>
      <Link
        to="/map"
        className="inline-block mt-2.5 pt-3 pb-0.5 font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent"
      >
        Open the map →
      </Link>
    </section>
  )
}
