import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SentinelMap from '@/components/map/SentinelMap'
import SeverityMeter from '@/components/ui/SeverityMeter'
import { useEvent } from '@/hooks/useEvent'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'
import type { NaturalEvent } from '@/lib/types'
import { formatDate, relativeTime } from '@/lib/time'
import { severityScore } from '@/lib/severity'

const NEARBY_DEGREES = 1

function distance(a: NaturalEvent, b: NaturalEvent): number {
  const dLat = a.latitude - b.latitude
  const dLon = a.longitude - b.longitude
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

export default function EventDetail() {
  const { id } = useParams()
  const { data: event, isLoading } = useEvent(id)
  const { data: nearbyPool } = useNaturalEvents({ categories: [], status: 'all', days: 90 })

  const nearby = useMemo(() => {
    if (!event || !nearbyPool) return []
    return nearbyPool
      .filter(
        (e) =>
          e.id !== event.id &&
          Math.abs(e.latitude - event.latitude) <= NEARBY_DEGREES &&
          Math.abs(e.longitude - event.longitude) <= NEARBY_DEGREES,
      )
      .sort((a, b) => distance(a, event) - distance(b, event))
      .slice(0, 5)
  }, [event, nearbyPool])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg text-text">
        <Navbar />
        <section className="max-w-3xl mx-auto px-4 pt-28 pb-24">
          <div className="h-8 w-2/3 rounded animate-pulse bg-surface" />
          <div className="h-4 w-1/3 rounded animate-pulse bg-surface mt-4" />
        </section>
        <Footer />
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-bg text-text">
        <Navbar />
        <section className="max-w-3xl mx-auto px-4 pt-28 pb-24 text-center">
          <h1 className="text-2xl font-bold mb-3">Event not found</h1>
          <p className="text-muted mb-6">It may have been pruned, or the link is incorrect.</p>
          <Link to="/map" className="text-accent hover:opacity-80">
            &larr; Back to Live Map
          </Link>
        </section>
        <Footer />
      </div>
    )
  }

  const color = CATEGORY_COLORS[event.category]
  const emoji = CATEGORY_EMOJIS[event.category]
  const score = severityScore(event)

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />

      <section className="max-w-3xl mx-auto px-4 pt-28 pb-16">
        <Link to="/map" className="text-sm text-muted hover:text-text transition-colors">
          &larr; Back to Live Map
        </Link>

        <div className="flex items-start gap-3 mt-4">
          <span className="text-4xl flex-shrink-0">{emoji}</span>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{event.title}</h1>
            <p className="text-sm text-muted mt-1">
              {event.place_name ?? `${event.latitude.toFixed(3)}, ${event.longitude.toFixed(3)}`} &middot;{' '}
              {relativeTime(event.started_at)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4">
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
            <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: color + '26', color }}>
              {event.severity_value} {event.severity_unit}
            </span>
          )}
        </div>

        <div className="mt-6 max-w-sm">
          <p className="text-xs text-muted mb-1.5">Normalized severity</p>
          <SeverityMeter score={score} />
        </div>

        {event.description && <p className="text-sm text-muted leading-relaxed mt-6">{event.description}</p>}

        <dl className="space-y-2 text-sm mt-6 rounded-xl p-5 bg-surface border border-border">
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
            className="inline-block text-sm font-medium mt-4 text-accent transition-opacity hover:opacity-80"
          >
            View source &rarr;
          </a>
        )}

        <div className="mt-8 rounded-2xl overflow-hidden border border-border" style={{ height: 260 }}>
          <SentinelMap
            events={[event]}
            selectedEvent={event}
            onEventSelect={() => {}}
            interactive={false}
            center={[event.latitude, event.longitude]}
            zoom={7}
          />
        </div>

        {nearby.length > 0 && (
          <div className="mt-10">
            <h2 className="text-lg font-bold mb-4">Nearby events</h2>
            <div className="space-y-2">
              {nearby.map((n) => (
                <Link
                  key={n.id}
                  to={`/event/${n.id}`}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 bg-surface border border-border transition-colors hover:border-accent"
                >
                  <span className="text-lg flex-shrink-0">{CATEGORY_EMOJIS[n.category]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted truncate">
                      {n.place_name ?? n.category} &middot; {relativeTime(n.started_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
