import { Fragment } from 'react'
import { LEVEL_NAMES } from '@/lib/desk/levels'
import { SCALE, scaleRows, type Scale } from '@/lib/desk/scale'
import type { Level } from '@/lib/desk/types'

const LEVELS: Level[] = [1, 2, 3, 4]

/** What each level means per category (the footer legend and About), under an edition's rules (else the current ones). */
export default function ScaleTable({ names = false, scale = SCALE }: { names?: boolean; scale?: Scale }) {
  return (
    <div className="grid grid-cols-[64px_repeat(4,minmax(0,1fr))] font-mono text-[11px] leading-[1.4]" role="table" aria-label="How levels are set">
      <div role="row" className="contents">
        <span role="columnheader" className="py-2 border-b border-rule">
          <span className="sr-only">Category</span>
        </span>
        {LEVELS.map((l) => (
          <span key={l} role="columnheader" className={`py-2 px-1 border-b border-rule font-semibold ${l === 4 ? 'text-accent' : ''}`}>
            {l}
            {names && <span className="block font-normal uppercase tracking-[0.04em]">{LEVEL_NAMES[l]}</span>}
          </span>
        ))}
      </div>
      {scaleRows(scale).map((r) => (
        <div role="row" className="contents" key={r.name}>
          <span role="rowheader" className="py-2 border-b border-rule text-ink-muted uppercase">
            {r.name.split(' ').map((w, i) => (
              <Fragment key={w}>
                {i > 0 && <br />}
                {w}
              </Fragment>
            ))}
          </span>
          {r.cells.map((c, i) => (
            <span key={i} role="cell" className="py-2 px-1 border-b border-rule">
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
