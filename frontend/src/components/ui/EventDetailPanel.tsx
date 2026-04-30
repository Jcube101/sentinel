import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'
import { X } from 'lucide-react'

interface Props {
  event: NaturalEvent | null
  onClose: () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

export default function EventDetailPanel({ event, onClose }: Props) {
  if (!event) return null

  const color = CATEGORY_COLORS[event.category]
  const emoji = CATEGORY_EMOJIS[event.category]

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 sm:hidden"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      <div
        className="fixed z-50 overflow-y-auto
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[60vh]
          sm:top-[56px] sm:right-0 sm:bottom-0 sm:left-auto sm:w-80 sm:rounded-none sm:max-h-none"
        style={{ backgroundColor: '#16161f', borderTop: '1px solid #2a2a3a', borderLeft: '1px solid #2a2a3a' }}
      >
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-2xl flex-shrink-0">{emoji}</span>
              <h3 className="font-semibold text-sm leading-snug truncate">{event.title}</h3>
            </div>
            <button onClick={onClose} className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
              <X size={16} style={{ color: '#7070a0' }} />
            </button>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={
                event.status === 'open'
                  ? { backgroundColor: '#22c55e33', color: '#22c55e' }
                  : { backgroundColor: '#7070a033', color: '#7070a0' }
              }
            >
              {event.status.toUpperCase()}
            </span>
            {event.severity_value != null && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: color + '26', color }}
              >
                {event.severity_value} {event.severity_unit}
              </span>
            )}
          </div>

          <div className="h-px" style={{ backgroundColor: '#2a2a3a' }} />

          {/* Details */}
          <dl className="space-y-2 text-sm">
            <Row label="Category">{emoji} {event.category}</Row>
            <Row label="Source">{event.source}</Row>
            <Row label="Started">{formatDate(event.started_at)}</Row>
            <Row label="Closed">{event.closed_at ? formatDate(event.closed_at) : 'Still active'}</Row>
            <Row label="Location">{event.place_name ?? `${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}`}</Row>
          </dl>

          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium mt-2 transition-opacity hover:opacity-80"
              style={{ color: '#f97316' }}
            >
              View source &rarr;
            </a>
          )}
        </div>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt style={{ color: '#7070a0' }}>{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
