import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import LiveMap from './pages/LiveMap'
import Insights from './pages/Insights'
import EventDetail from './pages/EventDetail'
import About from './pages/About'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/map" element={<LiveMap />} />
      <Route path="/insights" element={<Insights />} />
      <Route path="/event/:id" element={<EventDetail />} />
      <Route path="/about" element={<About />} />
      <Route path="/dashboard" element={<Navigate to="/map" replace />} />
    </Routes>
  )
}
