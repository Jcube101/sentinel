import { Link } from 'react-router-dom'
import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_EMOJIS } from '@/lib/types'
import { severityScore, severityBucket, SEVERITY_COLORS } from '@/lib/severity'
import { relativeTime } from '@/lib/time'

interface Props {
  events: NaturalEvent[]
  isLoading: boolean
}

const TOP_N = 8

const SEV_LABEL: Record<'low' | 'mid' | 'high', string> = {
  low: 'Low',
  mid: 'Elevated',
  high: 'Severe',
}

export default function ThreatFeed({ events, isLoading }: Props) {
  const ranked = [...events]
    .sort((a, b) => severityScore(b) - severityScore(a))
    .slice(0, TOP_N)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-surface border border-border animate-pulse" />
        ))}
      </div>
    )
  }

  if (ranked.length === 0) {
    return <p className="text-sm text-muted">No active threats right now — that&apos;s good news.</p>
  }

  return (
    <div className="space-y-2">
      {ranked.map((event) => {
        const bucket = severityBucket(severityScore(event))
        return (
          <Link
            key={event.id}
            to={`/event/${event.id}`}
            className="flex items-center gap-3 rounded-xl px-4 py-3 bg-surface border border-border transition-colors hover:border-accent"
          >
            <span className="text-xl flex-shrink-0">{CATEGORY_EMOJIS[event.category]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{event.title}</p>
              <p className="text-xs text-muted truncate">
                {event.place_name ?? event.category} &middot; {relativeTime(event.started_at)}
              </p>
            </div>
            <span
              className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
              style={{ backgroundColor: SEVERITY_COLORS[bucket] + '26', color: SEVERITY_COLORS[bucket] }}
            >
              {SEV_LABEL[bucket]}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
