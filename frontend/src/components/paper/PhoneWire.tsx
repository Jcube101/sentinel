import type { ReactNode } from 'react'
import { cityReading, fireDistricts, worstCities } from '@/lib/desk/cards'
import { quakeMemberLine } from '@/lib/desk/copy'
import { AIR_BAND_LABELS, counted, type DeskEntry } from '@/lib/desk/entries'
import { SOURCE_TITLES, sourceLines } from '@/lib/desk/sources'
import type { Edition, Snapshot } from '@/lib/desk/types'

function Wire({ title, right, children }: { title: string; right: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-b border-ink">
      <summary className="min-h-[56px] flex justify-between items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="font-cond font-semibold text-[19px]">{title}</span>
        <span className="font-mono text-[13px] whitespace-nowrap">
          {right} <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  )
}

const rowClass = 'flex justify-between gap-3 py-2 border-b border-rule text-[15px] leading-[1.35]'
const num = 'font-mono text-[13px] whitespace-nowrap'

interface Props {
  run: Edition
  snapshots: Snapshot[]
  entries: DeskEntry[]
}

/** "The wire": the phone desk's closing accordions (DeskPhone). Phones only. */
export default function PhoneWire({ run, snapshots, entries }: Props) {
  const fires = fireDistricts(snapshots)
  const air = snapshots.find((s) => s.category === 'air' && s.status === 'open')
  const cities = air ? worstCities(air.figures).slice(0, 10) : []
  const quakes = entries.flatMap((e) => (e.members.length ? e.members : [e])).filter((e) => e.category === 'earthquake')
  const maxM = Math.max(...quakes.map((qk) => qk.strength))
  const sources = sourceLines(run)
  const late = sources.filter((s) => s.failed).length

  return (
    <section aria-label="The wire" className="sm:hidden">
      <h2 className="m-0 font-mono font-normal text-[11px] tracking-[0.08em] uppercase pb-2 border-b-4 border-ink">The wire</h2>
      {fires.top.length > 0 && (
        <Wire title="Fires by district" right={`${fires.total} districts`}>
          <ul className="m-0 p-0 list-none">
            {fires.top.map((d) => (
              <li key={`${d.state}:${d.district}`} className={rowClass}>
                <span>
                  {d.district} <span className="text-ink-muted">· {d.state}</span>
                </span>
                <span className={num}>{d.fireEvents}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted uppercase">Fires on the last full day, busiest first</p>
        </Wire>
      )}
      {cities.length > 0 && air && (
        <Wire title="Worst air" right={`${air.figures.cities_reporting ?? cities.length} cities`}>
          <ul className="m-0 p-0 list-none">
            {cities.map((c) => (
              <li key={c.city} className={rowClass}>
                <span>
                  {c.city} <span className="text-ink-muted">· {AIR_BAND_LABELS[counted(c)].toLowerCase()}</span>
                </span>
                <span className={num}>{cityReading(c)}</span>
              </li>
            ))}
          </ul>
        </Wire>
      )}
      {quakes.length > 0 && (
        <Wire title="Earthquakes" right={`${quakes.length}, largest ${maxM.toFixed(1)}`}>
          <ul className="m-0 p-0 list-none">
            {quakes.map((qk) => (
              <li key={qk.key} className={rowClass}>
                <span>{quakeMemberLine(qk)}</span>
                <span className={num}>Level {qk.level}</span>
              </li>
            ))}
          </ul>
        </Wire>
      )}
      {sources.length > 0 && (
        <Wire
          title="Sources"
          right={
            late > 0 ? (
              <>
                <span className="text-accent font-semibold">{late} late</span> · {sources.length}
              </>
            ) : (
              `${sources.length} sources`
            )
          }
        >
          <ul className="m-0 p-0 list-none">
            {sources.map((s) => (
              <li key={s.id} className={rowClass}>
                <span>{SOURCE_TITLES[s.id] ?? s.name}</span>
                <span className={`${num} ${s.failed ? 'text-accent font-semibold' : ''}`}>{s.words}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 pt-2 font-mono text-[11px] text-ink-muted uppercase">How old each source's newest data was at publication</p>
        </Wire>
      )}
    </section>
  )
}
