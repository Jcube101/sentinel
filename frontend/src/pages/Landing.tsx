import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import { useAqiReadings } from '@/hooks/useAqiReadings'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import SentinelMap from '@/components/map/SentinelMap'
import ThreatFeed from '@/components/ui/ThreatFeed'
import { CATEGORY_COLORS } from '@/lib/types'

const CATEGORY_STRIP: Array<{ category: 'fire' | 'flood' | 'cyclone' | 'earthquake'; label: string; emoji: string }> = [
  { category: 'fire', label: 'Fires', emoji: '🔥' },
  { category: 'flood', label: 'Floods', emoji: '🌊' },
  { category: 'cyclone', label: 'Cyclones', emoji: '🌀' },
  { category: 'earthquake', label: 'Earthquakes', emoji: '🌍' },
]

const HOW_IT_WORKS = [
  { title: '4 Authoritative Sources', desc: 'NASA FIRMS, NASA EONET, GDACS, and USGS cover fires, floods, cyclones, and earthquakes across India.' },
  { title: 'Updated 3× Daily', desc: 'An automated pipeline fetches and normalizes new events at 09:00, 15:00, and 21:00 UTC.' },
  { title: 'Interactive Map', desc: 'Clustered markers, category filters, and detail panels on a fast, WebGL-free Leaflet map.' },
]

const DATA_SOURCE_BADGES = ['NASA FIRMS', 'NASA EONET', 'GDACS', 'USGS', 'OpenAQ']

export default function Landing() {
  const fire = useNaturalEvents({ categories: ['fire'], status: 'open', days: 30 })
  const flood = useNaturalEvents({ categories: ['flood'], status: 'open', days: 30 })
  const cyclone = useNaturalEvents({ categories: ['cyclone'], status: 'open', days: 30 })
  const earthquake = useNaturalEvents({ categories: ['earthquake'], status: 'open', days: 30 })
  const { data: aqiData } = useAqiReadings()

  const isLoading = fire.isLoading || flood.isLoading || cyclone.isLoading || earthquake.isLoading

  const counts: Record<string, number> = {
    fire: fire.data?.length ?? 0,
    flood: flood.data?.length ?? 0,
    cyclone: cyclone.data?.length ?? 0,
    earthquake: earthquake.data?.length ?? 0,
  }
  const totalActive = counts.fire + counts.flood + counts.cyclone + counts.earthquake

  const aqiStationCount = useMemo(
    () => new Set((aqiData ?? []).map((r) => r.location_id)).size,
    [aqiData],
  )

  const allEvents = useMemo(
    () => [...(fire.data ?? []), ...(flood.data ?? []), ...(cyclone.data ?? []), ...(earthquake.data ?? [])],
    [fire.data, flood.data, cyclone.data, earthquake.data],
  )

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />

      {/* Hero */}
      <section
        className="flex flex-col items-center justify-center text-center px-4"
        style={{ minHeight: '70vh', paddingTop: 88, paddingBottom: 48 }}
      >
        <span className="text-xs font-bold tracking-[0.3em] uppercase mb-6 text-accent font-mono">
          India Disaster Tracker
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight">
          Every active disaster.
          <br />
          <span className="text-accent">Mapped in real time.</span>
        </h1>
        <p className="mt-6 max-w-lg text-base sm:text-lg text-muted">
          Sentinel aggregates fires, floods, cyclones, and earthquakes from four official sources
          across India — refreshed 3× daily and visualized on a live map.
        </p>

        <p className="mt-8 text-sm sm:text-base text-muted">
          {isLoading ? (
            'Loading live status…'
          ) : (
            <>
              Tracking <span className="font-semibold text-text">{totalActive}</span> active events across
              India from <span className="font-semibold text-text">4</span> official sources — updated 3× daily.
            </>
          )}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
          <Link
            to="/map"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold text-white bg-accent transition-colors hover:bg-accent-hover"
          >
            View Live Map &rarr;
          </Link>
          <Link
            to="/insights"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold border border-border text-text transition-colors hover:border-accent"
          >
            Explore Insights
          </Link>
        </div>
      </section>

      {/* Active Threats */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold">Active Threats</h2>
            <Link to="/map" className="text-sm text-accent transition-opacity hover:opacity-80">
              View all &rarr;
            </Link>
          </div>
          <ThreatFeed events={allEvents.filter((e) => e.status === 'open')} isLoading={isLoading} />
        </div>
      </section>

      {/* Category strip */}
      <section className="pb-16 px-4">
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-5 gap-3">
          {CATEGORY_STRIP.map(({ category, label, emoji }) => (
            <Link
              key={category}
              to={`/map?category=${category}`}
              className="rounded-xl p-4 text-center bg-surface border border-border transition-colors hover:border-accent"
            >
              <p className="text-lg">{emoji}</p>
              {isLoading ? (
                <div className="h-6 w-10 mx-auto mt-1 rounded animate-pulse bg-border" />
              ) : (
                <p className="text-xl font-bold mt-1" style={{ color: CATEGORY_COLORS[category] }}>
                  {counts[category]}
                </p>
              )}
              <p className="text-xs mt-1 text-muted">{label}</p>
            </Link>
          ))}
          <Link
            to="/map"
            className="rounded-xl p-4 text-center bg-surface border border-border transition-colors hover:border-accent"
          >
            <p className="text-lg">💨</p>
            <p className="text-xl font-bold mt-1 text-text">{aqiStationCount}</p>
            <p className="text-xs mt-1 text-muted">AQI Stations</p>
          </Link>
        </div>
      </section>

      {/* Mini map preview */}
      <section className="pb-16 px-4">
        <div className="max-w-4xl mx-auto relative rounded-2xl overflow-hidden border border-border" style={{ height: 320 }}>
          <SentinelMap
            events={allEvents}
            selectedEvent={null}
            onEventSelect={() => {}}
            interactive={false}
          />
          <Link
            to="/map"
            className="absolute inset-0 flex items-end justify-center pb-6 transition-colors"
            style={{ background: 'linear-gradient(to top, rgba(10,10,15,0.85), rgba(10,10,15,0))' }}
          >
            <span className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-accent">
              Open full map &rarr;
            </span>
          </Link>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4 bg-surface-2">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((card) => (
              <div key={card.title} className="rounded-xl p-6 bg-surface border border-border">
                <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-muted">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sources badge grid */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Data Sources</h2>
          <p className="text-sm text-muted mb-10">
            Public APIs, aggregated automatically.{' '}
            <Link to="/about" className="text-accent hover:opacity-80">
              Read our methodology &rarr;
            </Link>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {DATA_SOURCE_BADGES.map((name) => (
              <span
                key={name}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-surface border border-border text-muted"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="pb-24 px-4">
        <div className="max-w-2xl mx-auto rounded-xl px-6 py-5 bg-surface border border-border text-center">
          <p className="text-sm text-muted">
            Sentinel is not an official emergency alert system. For emergencies, contact local
            authorities (NDMA / 112).
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
