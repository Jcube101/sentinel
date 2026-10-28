import { Routes, Route, Navigate } from 'react-router-dom'
import Desk from './pages/Desk'
import About from './pages/About'
import Item from './pages/Item'
import MapPage from './pages/MapPage'
import Sources from './pages/Sources'
import Archive from './pages/Archive'
import DatePage from './pages/DatePage'
import Placeholder from './pages/Placeholder'

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
      <Route path="*" element={<Placeholder title="Not found" line="There's no page at this address." />} />
    </Routes>
  )
}
