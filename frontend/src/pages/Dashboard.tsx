import { useState } from 'react'
import Navbar from '@/components/layout/Navbar'
import FilterBar from '@/components/ui/FilterBar'
import SentinelMap from '@/components/map/SentinelMap'
import EventDetailPanel from '@/components/ui/EventDetailPanel'
import StatsBar from '@/components/ui/StatsBar'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import type { EventFilters, NaturalEvent } from '@/lib/types'

export default function Dashboard() {
  const [filters, setFilters] = useState<EventFilters>({
    categories: [],
    status: 'open',
    days: 30,
  })
  const [selectedEvent, setSelectedEvent] = useState<NaturalEvent | null>(null)

  const { data } = useNaturalEvents(filters)
  const events = data ?? []

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#0a0a0f' }}>
      <Navbar />
      <div style={{ height: 56 }} />
      <FilterBar filters={filters} onChange={setFilters} totalCount={events.length} />
      <div className="flex-1 relative">
        <SentinelMap events={events} selectedEvent={selectedEvent} onEventSelect={setSelectedEvent} />
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      </div>
      <StatsBar events={events} />
    </div>
  )
}
