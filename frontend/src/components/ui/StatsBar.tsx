import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_COLORS } from '@/lib/types'

interface Props {
  events: NaturalEvent[]
}

const CATS = [
  { key: 'fire' as const, emoji: '\u{1F525}', label: 'fires' },
  { key: 'flood' as const, emoji: '\u{1F30A}', label: 'floods' },
  { key: 'cyclone' as const, emoji: '\u{1F300}', label: 'cyclones' },
  { key: 'earthquake' as const, emoji: '\u{1F30D}', label: 'earthquakes' },
]

export default function StatsBar({ events }: Props) {
  function count(cat: string) {
    return events.filter((e) => e.category === cat).length
  }

  const latest = events.length > 0
    ? new Date(events[0].started_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
      })
    : null

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 overflow-x-auto"
      style={{ backgroundColor: '#111118', borderTop: '1px solid #2a2a3a', height: 44 }}
    >
      {CATS.map((cat, i) => (
        <span key={cat.key} className="flex items-center gap-1 text-xs whitespace-nowrap">
          {i > 0 && <span className="mr-2" style={{ color: '#7070a0' }}>&middot;</span>}
          <span>{cat.emoji}</span>
          <span style={{ color: CATEGORY_COLORS[cat.key], fontWeight: 600 }}>{count(cat.key)}</span>
          <span style={{ color: '#7070a0' }}>{cat.label}</span>
        </span>
      ))}

      {latest && (
        <span className="ml-auto text-xs whitespace-nowrap" style={{ color: '#7070a0' }}>
          Last updated: {latest}
        </span>
      )}
    </div>
  )
}
