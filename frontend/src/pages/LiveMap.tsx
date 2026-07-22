import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Navbar from '@/components/layout/Navbar'
import FilterBar from '@/components/ui/FilterBar'
import SentinelMap from '@/components/map/SentinelMap'
import EventDetailPanel from '@/components/ui/EventDetailPanel'
import AqiPanel from '@/components/ui/AqiPanel'
import StatsBar from '@/components/ui/StatsBar'
import CommandPalette from '@/components/ui/CommandPalette'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import { useAqiReadings } from '@/hooks/useAqiReadings'
import type { EventFilters, NaturalEvent } from '@/lib/types'

const CATEGORY_SLUGS: EventFilters['categories'] = ['fire', 'flood', 'cyclone', 'earthquake']

export default function LiveMap() {
  const [searchParams] = useSearchParams()
  const initialCategory = searchParams.get('category')
  const isValidCategory = (CATEGORY_SLUGS as string[]).includes(initialCategory ?? '')

  const [filters, setFilters] = useState<EventFilters>({
    categories: isValidCategory ? [initialCategory as EventFilters['categories'][number]] : [],
    status: 'open',
    days: 30,
  })
  const [selectedEvent, setSelectedEvent] = useState<NaturalEvent | null>(null)
  const [showAqi, setShowAqi] = useState(false)
  const [showSearch, setShowSearch] = useState(false)

  const { data, isLoading } = useNaturalEvents(filters)
  const events = data ?? []

  const { data: aqiData, isLoading: aqiLoading } = useAqiReadings()
  const aqiReadings = aqiData ?? []
  const aqiStationCount = new Set(aqiReadings.map((r) => r.location_id)).size

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg">
      <Navbar />
      <div style={{ height: 56 }} />
      <FilterBar
        filters={filters}
        onChange={setFilters}
        totalCount={events.length}
        showAqi={showAqi}
        onToggleAqi={() => setShowAqi((v) => !v)}
        aqiCount={aqiStationCount}
        onSearchClick={() => setShowSearch(true)}
      />
      <div className="flex-1 relative">
        <SentinelMap events={events} selectedEvent={selectedEvent} onEventSelect={setSelectedEvent} isLoading={isLoading} />
        <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        {showAqi && (
          <AqiPanel readings={aqiReadings} isLoading={aqiLoading} onClose={() => setShowAqi(false)} />
        )}
      </div>
      <StatsBar events={events} aqiReadings={aqiReadings} />
      <CommandPalette events={events} open={showSearch} onOpenChange={setShowSearch} />
    </div>
  )
}
