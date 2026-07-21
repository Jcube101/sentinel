import { useMemo, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import Supercluster from 'supercluster'
import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_COLORS } from '@/lib/types'

interface Props {
  events: NaturalEvent[]
  onEventSelect: (event: NaturalEvent | null) => void
  selectedEvent: NaturalEvent | null
  isLoading?: boolean
}

// Dark raster basemap. Leaflet renders plain <img> tiles on the DOM, so unlike
// the previous MapLibre/WebGL map this works in every browser, including ones
// with hardware acceleration or WebGL disabled.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

const INDIA_CENTER: [number, number] = [22.5, 82.8]

function eventIcon(event: NaturalEvent, isSelected: boolean): L.DivIcon {
  const size = isSelected ? 18 : 14
  const pulse = event.status === 'open' ? 'marker-pulse' : ''
  const border = isSelected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.4)'
  return L.divIcon({
    className: '',
    html: `<div class="${pulse}" style="width:${size}px;height:${size}px;border-radius:50%;background:${CATEGORY_COLORS[event.category]};border:${border};box-sizing:border-box;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function clusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 24 : count < 100 ? 32 : 40
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,0.12);border:1.5px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:600;box-sizing:border-box;">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// Renders the clustered event markers. Lives inside MapContainer so it can read
// the live map via useMap() and recluster whenever the viewport changes.
function ClusterLayer({ events, onEventSelect, selectedEvent }: Omit<Props, 'isLoading'>) {
  const map = useMap()
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])
  useMapEvents({ moveend: bump, zoomend: bump })

  const points = useMemo(
    () =>
      events.map((e, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.longitude, e.latitude] },
        properties: { index: i },
      })),
    [events],
  )

  const cluster = useMemo(() => {
    const sc = new Supercluster<{ index: number }>({ radius: 60, maxZoom: 12 })
    sc.load(points)
    return sc
  }, [points])

  const clusters = useMemo(() => {
    const b = map.getBounds()
    const bbox: [number, number, number, number] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    return cluster.getClusters(bbox, Math.round(map.getZoom()))
    // version forces a recompute when the map moves or zooms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, map, version])

  return (
    <>
      {clusters.map((feat) => {
        const [lon, lat] = feat.geometry.coordinates
        const props = feat.properties as Record<string, number | boolean | undefined>

        if (props.cluster) {
          const clusterId = props.cluster_id as number
          return (
            <Marker
              key={`c-${clusterId}`}
              position={[lat, lon]}
              icon={clusterIcon(props.point_count as number)}
              eventHandlers={{
                click: () => {
                  const zoom = cluster.getClusterExpansionZoom(clusterId)
                  map.setView([lat, lon], zoom)
                },
              }}
            />
          )
        }

        const event = events[props.index as number]
        if (!event) return null
        const isSelected = selectedEvent?.id === event.id

        return (
          <Marker
            key={event.id}
            position={[lat, lon]}
            icon={eventIcon(event, isSelected)}
            eventHandlers={{ click: () => onEventSelect(event) }}
          />
        )
      })}
    </>
  )
}

export default function SentinelMap({ events, onEventSelect, selectedEvent, isLoading }: Props) {
  return (
    <>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,10,15,0.7)',
            color: '#7070a0',
            fontSize: '14px',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          Loading events...
        </div>
      )}
      <MapContainer
        center={INDIA_CENTER}
        zoom={4}
        minZoom={3}
        maxZoom={14}
        zoomControl={false}
        style={{ width: '100%', height: '100%', background: '#0a0a0f' }}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ZoomControl position="topright" />
        <ClusterLayer events={events} onEventSelect={onEventSelect} selectedEvent={selectedEvent} />
      </MapContainer>
    </>
  )
}
