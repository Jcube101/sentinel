import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Desk from './pages/Desk'
import Placeholder from './pages/Placeholder'
import PaperShell from './components/paper/PaperShell'

// The front page (the Desk) is in the main bundle; every other page loads
// when it is first opened, so the Desk's headline arrives sooner.
const Item = lazy(() => import('./pages/Item'))
const MapPage = lazy(() => import('./pages/MapPage'))
const Archive = lazy(() => import('./pages/Archive'))
const DatePage = lazy(() => import('./pages/DatePage'))
const Sources = lazy(() => import('./pages/Sources'))
const About = lazy(() => import('./pages/About'))
const EventRedirect = lazy(() => import('./pages/EventRedirect'))

// Development pages (/dev/symbols): in `npm run dev`, and in builds made with
// VITE_DEV_PAGES=1 (`npm run build:preview`, for the preview on the Pi). The
// plain `npm run build` that Render runs leaves them out of the bundle.
const DEV_PAGES = import.meta.env.DEV || import.meta.env.VITE_DEV_PAGES === '1'
const DevSymbols = DEV_PAGES ? lazy(() => import('./pages/dev/Symbols')) : null

const loading = (
  <PaperShell>
    <p className="py-10 font-mono text-[13px] uppercase tracking-[0.06em] text-ink-muted">Loading…</p>
  </PaperShell>
)

/** The Situation Report (docs/situation-report-plan.md). Old addresses redirect to their new pages. */
export default function App() {
  return (
    <Suspense fallback={loading}>
      <Routes>
        <Route path="/" element={<Desk />} />
        <Route path="/edition/:n" element={<Desk />} />
        <Route path="/item/:category/:ref" element={<Item />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/archive" element={<Archive />} />
        <Route path="/date/:day" element={<DatePage />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/about" element={<About />} />
        {/* The old site's addresses. */}
        <Route path="/insights" element={<Navigate to="/archive" replace />} />
        <Route path="/dashboard" element={<Navigate to="/map" replace />} />
        <Route path="/event/:id" element={<EventRedirect />} />
        {DevSymbols && <Route path="/dev/symbols" element={<DevSymbols />} />}
        <Route path="*" element={<Placeholder title="Not found" line="There's no page at this address." />} />
      </Routes>
    </Suspense>
  )
}
