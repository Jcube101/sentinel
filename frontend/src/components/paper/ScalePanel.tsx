import { Fragment } from 'react'
import { SCALE, SCALE_ROWS, mag } from '@/lib/desk/scale'

const q = SCALE.quake
const a = SCALE.air
const f = SCALE.fire

/** "How levels are set" (DeskSeverity's sidebar; the first item of the phone wire). */
export default function ScalePanel({ heading = true }: { heading?: boolean }) {
  const capped = f.calibrationCap < 4
  return (
    <section aria-label="How levels are set">
      {heading && (
        <h2 className="m-0 font-mono font-normal text-[12px] tracking-[0.08em] uppercase pb-2.5 border-b border-ink">How levels are set</h2>
      )}
      <div className="grid grid-cols-[60px_repeat(4,minmax(0,1fr))] font-mono text-[11px] leading-[1.4]" role="table">
        <div role="row" className="contents">
          <span role="columnheader" className="py-2.5 border-b border-rule">
            <span className="sr-only">Category</span>
          </span>
          {[1, 2, 3, 4].map((l) => (
            <span key={l} role="columnheader" className={`py-2.5 px-1 border-b border-rule font-semibold ${l === 4 ? 'text-accent' : ''}`}>
              {l}
            </span>
          ))}
        </div>
        {SCALE_ROWS.map((r) => (
          <div role="row" className="contents" key={r.name}>
            <span role="rowheader" className="py-2.5 border-b border-rule text-ink-muted uppercase">
              {r.name.split(' ').map((w, i) => (
                <Fragment key={w}>
                  {i > 0 && <br />}
                  {w}
                </Fragment>
              ))}
            </span>
            {r.cells.map((c, i) => (
              <span key={i} role="cell" className="py-2.5 px-1 border-b border-rule">
                {c}
              </span>
            ))}
          </div>
        ))}
      </div>
      <ul className="m-0 mt-3 p-0 list-none flex flex-col gap-1.5 text-[13px] leading-[1.45] text-ink-muted">
        <li>
          Quakes within {q.indiaBufferKm} km of India, or M{mag(q.anywhereMinMagnitude)}+ elsewhere in the region (USGS). Floods and cyclones:
          GDACS's alert for the current episode.
        </li>
        <li>
          Air: CPCB AQI bands (poor {a.aqi.poorAbove + 1}–{a.aqi.veryPoorAbove}, very poor {a.aqi.veryPoorAbove + 1}–{a.aqi.severeAbove},
          severe {a.aqi.severeAbove + 1}+). A city counts as severe after {a.severeConfirmRuns} runs in a row.
        </li>
        <li>
          Fire: a state's fire events in a day against the same time of year in {f.baselineYears}, from {f.minFireEvents} events. Level 4: a fire
          of {f.level4MinFrpMw} MW or more within {f.level4NearKm} km of a town of {f.level4MinPopulation.toLocaleString('en-IN')}+.
        </li>
        {capped && (
          <li>
            Fire levels from satellite counts stop at Level {f.calibrationCap} until live counts are checked against the archive. A GDACS
            forest-fire alert can still lift a state to Level {f.gdacsWildfireLevel}. A dashed square marks the level a capped item would
            have.
          </li>
        )}
      </ul>
      <p className="m-0 mt-3 text-[14px] leading-[1.5] text-ink-muted italic">
        Fires are judged against the same time of year in past years, so the October stubble season doesn't read as a national emergency.
      </p>
    </section>
  )
}
