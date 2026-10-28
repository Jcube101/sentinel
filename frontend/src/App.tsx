import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Desk from './pages/Desk'
import About from './pages/About'
import Item from './pages/Item'
import MapPage from './pages/MapPage'
import Sources from './pages/Sources'
import Archive from './pages/Archive'
import DatePage from './pages/DatePage'
import Placeholder from './pages/Placeholder'

// Development pages (/dev/symbols): in `npm run dev`, and in builds made with
// VITE_DEV_PAGES=1 (`npm run build:preview`, for the preview on the Pi). The
// plain `npm run build` that Render runs leaves them out of the bundle.
const DEV_PAGES = import.meta.env.DEV || import.meta.env.VITE_DEV_PAGES === '1'
const DevSymbols = DEV_PAGES ? lazy(() => import('./pages/dev/Symbols')) : null

// The Situation Report redesign (docs/situation-report-plan.md). The old
// pages stay in src/pages, unrouted, until the switch-over (plan step 9),
// which also sends /event/:id to the matching desk item.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Desk />} />
      <Route path="/edition/:n" element={<Desk />} />
      <Route path="/item/:category/:ref" element={<Item />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/date/:day" element={<DatePage />} />
      <Route path="/sources" element={<Sources />} />
      <Route path="/about" element={<About />} />
      <Route path="/insights" element={<Navigate to="/archive" replace />} />
      <Route path="/dashboard" element={<Navigate to="/map" replace />} />
      <Route path="/event/:id" element={<Navigate to="/map" replace />} />
      {DevSymbols && (
        <Route
          path="/dev/symbols"
          element={
            <Suspense fallback={null}>
              <DevSymbols />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<Placeholder title="Not found" line="There's no page at this address." />} />
    </Routes>
  )
}
