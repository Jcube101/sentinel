import { Routes, Route, Navigate } from 'react-router-dom'
import Desk from './pages/Desk'
import About from './pages/About'
import Item from './pages/Item'
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
      <Route
        path="/map"
        element={<Placeholder title="Map" line="The map of this edition's items, with fire activity by district. Coming in a later step of the redesign." />}
      />
      <Route
        path="/archive"
        element={
          <Placeholder
            title="Archive"
            line="Every edition by date, with each day's top item. Coming in a later step; until then, step through editions with the ‹ No. links on the desk."
          />
        }
      />
      <Route
        path="/sources"
        element={<Placeholder title="Sources" line="How each source answered in each run, and how fresh its data is. Coming in a later step of the redesign." />}
      />
      <Route path="/about" element={<About />} />
      <Route path="/insights" element={<Navigate to="/archive" replace />} />
      <Route path="/dashboard" element={<Navigate to="/map" replace />} />
      <Route path="/event/:id" element={<Navigate to="/map" replace />} />
      <Route path="*" element={<Placeholder title="Not found" line="There's no page at this address." />} />
    </Routes>
  )
}
