import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

const DATA_SOURCES = [
  { name: 'NASA FIRMS', desc: 'Fire hotspots detected by the VIIRS instrument on the NOAA-20 satellite.', url: 'https://firms.modaps.eosdis.nasa.gov/' },
  { name: 'NASA EONET', desc: 'Wildfires and severe storms tracked by the Earth Observatory Natural Event Tracker.', url: 'https://eonet.gsfc.nasa.gov/' },
  { name: 'GDACS', desc: 'Floods, cyclones, and earthquakes from the Global Disaster Alert and Coordination System (UN/EC).', url: 'https://www.gdacs.org/' },
  { name: 'USGS', desc: 'Earthquakes of magnitude 4.0 and above from the US Geological Survey.', url: 'https://earthquake.usgs.gov/' },
  { name: 'OpenAQ', desc: 'Air quality readings (PM2.5, PM10, NO₂, SO₂, O₃) from ground stations across India.', url: 'https://openaq.org/' },
]

export default function About() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />

      <section className="max-w-3xl mx-auto px-4 pt-28 pb-16">
        <span className="text-xs font-bold tracking-[0.3em] uppercase text-accent font-mono">About</span>
        <h1 className="text-3xl sm:text-4xl font-bold mt-3 mb-4">Methodology &amp; Scope</h1>
        <p className="text-base text-muted leading-relaxed">
          Sentinel is a personal project that aggregates public disaster and air-quality data for
          India into a single live map. It is not an official emergency alert system — for
          emergencies, contact local authorities (NDMA / 112).
        </p>
      </section>

      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { title: 'Four authoritative sources', desc: 'NASA FIRMS, NASA EONET, GDACS, and USGS cover fires, floods, cyclones, and earthquakes across India.' },
              { title: 'Refreshed 3× daily', desc: 'An automated pipeline on a Raspberry Pi fetches and normalizes new events at 09:00, 15:00, and 21:00 UTC.' },
              { title: 'Interactive map', desc: 'Clustered markers, category and status filters, and detail panels rendered on a lightweight Leaflet map.' },
            ].map((card) => (
              <div key={card.title} className="rounded-xl p-6 bg-surface border border-border">
                <h3 className="font-semibold text-base mb-2">{card.title}</h3>
                <p className="text-sm text-muted">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Data sources</h2>
          <div className="space-y-3">
            {DATA_SOURCES.map((src) => (
              <a
                key={src.name}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl px-6 py-4 bg-surface border border-border transition-colors hover:border-accent"
              >
                <div>
                  <span className="font-medium">{src.name}</span>
                  <span className="ml-3 text-sm text-muted">{src.desc}</span>
                </div>
                <span className="text-muted">&rarr;</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4">Scope &amp; limitations</h2>
          <ul className="space-y-2 text-sm text-muted list-disc list-inside">
            <li>Coverage is limited to events located within India&apos;s bounding box.</li>
            <li>Severity is normalized client-side for cross-category ranking; it is a rough indicator, not an official rating.</li>
            <li>Data may lag real-world events by up to one refresh cycle (~6 hours).</li>
            <li>Sentinel is read-only — there is currently no alerting or notification feature.</li>
          </ul>
          <p className="text-sm text-muted mt-6 rounded-xl px-5 py-4 bg-surface border border-border">
            Sentinel is not an official emergency alert system. For emergencies, contact local
            authorities (NDMA / 112).
          </p>
        </div>
      </section>

      <Footer />
    </div>
  )
}
