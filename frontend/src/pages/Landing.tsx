import { Link } from 'react-router-dom'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { CATEGORY_COLORS } from '@/lib/types'

const STATS: Array<{ category: 'fire' | 'flood' | 'cyclone' | 'earthquake'; label: string }> = [
  { category: 'fire', label: 'Fires' },
  { category: 'flood', label: 'Floods' },
  { category: 'cyclone', label: 'Cyclones' },
  { category: 'earthquake', label: 'Earthquakes' },
]

const DATA_SOURCES = [
  { name: 'NASA FIRMS', desc: 'Fire hotspots (VIIRS NOAA-20)', url: 'https://firms.modaps.eosdis.nasa.gov/' },
  { name: 'NASA EONET', desc: 'Wildfires & severe storms', url: 'https://eonet.gsfc.nasa.gov/' },
  { name: 'GDACS', desc: 'Floods, cyclones, earthquakes', url: 'https://www.gdacs.org/' },
  { name: 'USGS', desc: 'Earthquakes M4.0+', url: 'https://earthquake.usgs.gov/' },
  { name: 'OpenAQ', desc: 'Air quality (PM2.5, PM10, NO₂, SO₂, O₃)', url: 'https://openaq.org/' },
]

export default function Landing() {
  const { data: events, isLoading } = useNaturalEvents({ categories: [], status: 'open', days: 30 })

  function countCategory(cat: string) {
    if (!events) return 0
    return events.filter((e) => e.category === cat).length
  }

  return (
    <div style={{ backgroundColor: '#0a0a0f', color: '#f0f0f5' }} className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4" style={{ minHeight: '100vh', paddingTop: 56 }}>
        <span
          className="text-xs font-bold tracking-[0.3em] uppercase mb-6"
          style={{ color: '#f97316', fontFamily: 'monospace' }}
        >
          India Disaster Tracker
        </span>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold leading-tight">
          Every active disaster.
          <br />
          <span style={{ color: '#f97316' }}>Mapped in real time.</span>
        </h1>
        <p className="mt-6 max-w-lg text-base sm:text-lg" style={{ color: '#7070a0' }}>
          Sentinel aggregates fires, floods, cyclones, and earthquakes from five public APIs — updated daily and visualised on a live map.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 w-full max-w-2xl">
          {STATS.map(({ category, label }) => (
            <div
              key={category}
              className="rounded-xl p-4 text-center"
              style={{ backgroundColor: '#16161f', border: '1px solid #2a2a3a' }}
            >
              {isLoading ? (
                <div className="h-8 w-12 mx-auto rounded animate-pulse" style={{ backgroundColor: '#2a2a3a' }} />
              ) : (
                <p className="text-2xl font-bold" style={{ color: CATEGORY_COLORS[category] }}>
                  {countCategory(category)}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: '#7070a0' }}>{label}</p>
            </div>
          ))}
        </div>

        <Link
          to="/dashboard"
          className="mt-12 inline-flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#f97316', color: '#fff' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ea6a0a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f97316')}
        >
          Open Live Map &rarr;
        </Link>
      </section>

      {/* How It Works */}
      <section className="py-24 px-4" style={{ backgroundColor: '#111118' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { title: 'NASA & UN Data', desc: 'Five authoritative APIs covering fires, floods, cyclones, earthquakes, and air quality across India.' },
              { title: 'Updated Daily', desc: 'An automated pipeline fetches and normalises new events every day at 6:30 AM IST.' },
              { title: 'Interactive Map', desc: 'Clustered markers, category filters, and detail panels — all on a fast WebGL map.' },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-xl p-6"
                style={{ backgroundColor: '#16161f', border: '1px solid #2a2a3a' }}
              >
                <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
                <p className="text-sm" style={{ color: '#7070a0' }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Sources */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">Data Sources</h2>
          <div className="space-y-3">
            {DATA_SOURCES.map((src) => (
              <a
                key={src.name}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl px-6 py-4 transition-colors"
                style={{ backgroundColor: '#16161f', border: '1px solid #2a2a3a' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#f97316')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a2a3a')}
              >
                <div>
                  <span className="font-medium">{src.name}</span>
                  <span className="ml-3 text-sm" style={{ color: '#7070a0' }}>{src.desc}</span>
                </div>
                <span style={{ color: '#7070a0' }}>&rarr;</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
