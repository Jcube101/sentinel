import type { AqiReading, NaturalEvent } from '@/lib/types'
import { CATEGORY_COLORS } from '@/lib/types'
import { relativeTime } from '@/lib/time'

interface Props {
  events: NaturalEvent[]
  aqiReadings: AqiReading[]
}

const CATS = [
  { key: 'fire' as const, emoji: '\u{1F525}', label: 'fires' },
  { key: 'flood' as const, emoji: '\u{1F30A}', label: 'floods' },
  { key: 'cyclone' as const, emoji: '\u{1F300}', label: 'cyclones' },
  { key: 'earthquake' as const, emoji: '\u{1F30D}', label: 'earthquakes' },
]

// PM2.5 bands mirrored from AqiPanel/Insights — indicative, not a certified AQI calc.
function pm25Color(value: number): string {
  if (value <= 30) return '#22c55e'
  if (value <= 60) return '#eab308'
  if (value <= 90) return '#f97316'
  if (value <= 120) return '#ef4444'
  return '#991b1b'
}

function worstAqi(readings: AqiReading[]): { name: string; value: number } | null {
  const latestByLocation = new Map<string, AqiReading>()
  for (const r of readings) {
    if (r.parameter !== 'pm25') continue
    const existing = latestByLocation.get(r.location_id)
    if (!existing || new Date(r.recorded_at) > new Date(existing.recorded_at)) {
      latestByLocation.set(r.location_id, r)
    }
  }
  let worst: AqiReading | null = null
  for (const r of latestByLocation.values()) {
    if (!worst || r.value > worst.value) worst = r
  }
  return worst ? { name: worst.location_name, value: worst.value } : null
}

export default function StatsBar({ events, aqiReadings }: Props) {
  function count(cat: string) {
    return events.filter((e) => e.category === cat).length
  }

  const latest = events.length > 0 ? events[0] : null
  const worst = worstAqi(aqiReadings)

  return (
    <div className="flex items-center gap-3 px-4 py-2 overflow-x-auto bg-surface-2 border-t border-border" style={{ height: 44 }}>
      {CATS.map((cat, i) => (
        <span key={cat.key} className="flex items-center gap-1 text-xs whitespace-nowrap">
          {i > 0 && <span className="mr-2 text-muted">&middot;</span>}
          <span>{cat.emoji}</span>
          <span style={{ color: CATEGORY_COLORS[cat.key], fontWeight: 600 }}>{count(cat.key)}</span>
          <span className="text-muted">{cat.label}</span>
        </span>
      ))}

      {worst && (
        <span className="flex items-center gap-1 text-xs whitespace-nowrap">
          <span className="mr-2 text-muted">&middot;</span>
          <span>💨</span>
          <span style={{ color: pm25Color(worst.value), fontWeight: 600 }}>{worst.value.toFixed(0)}</span>
          <span className="text-muted truncate max-w-[140px]">worst PM2.5 ({worst.name})</span>
        </span>
      )}

      {latest && (
        <span className="ml-auto text-xs whitespace-nowrap text-muted">
          Last event {relativeTime(latest.started_at)}
        </span>
      )}
    </div>
  )
}
