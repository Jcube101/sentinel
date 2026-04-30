import { useState, useMemo, useCallback } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import Supercluster from 'supercluster'
import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_COLORS } from '@/lib/types'
import ClusterMarker from './ClusterMarker'

interface Props {
  events: NaturalEvent[]
  onEventSelect: (event: NaturalEvent | null) => void
  selectedEvent: NaturalEvent | null
}

interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  bounds: [number, number, number, number] | null
}

export default function SentinelMap({ events, onEventSelect, selectedEvent }: Props) {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 82.8,
    latitude: 22.5,
    zoom: 4.2,
    bounds: null,
  })

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
    if (!viewState.bounds) return []
    return cluster.getClusters(viewState.bounds, Math.floor(viewState.zoom))
  }, [cluster, viewState.bounds, viewState.zoom])

  const handleMove = useCallback((evt: { viewState: { longitude: number; latitude: number; zoom: number } }) => {
    setViewState((prev) => ({ ...prev, ...evt.viewState }))
  }, [])

  const handleMoveEnd = useCallback((evt: { target: { getBounds: () => { toArray: () => [[number, number], [number, number]] } } }) => {
    const b = evt.target.getBounds().toArray()
    setViewState((prev) => ({
      ...prev,
      bounds: [b[0][0], b[0][1], b[1][0], b[1][1]],
    }))
  }, [])

  const handleLoad = useCallback((evt: { target: { getBounds: () => { toArray: () => [[number, number], [number, number]] } } }) => {
    const b = evt.target.getBounds().toArray()
    setViewState((prev) => ({
      ...prev,
      bounds: [b[0][0], b[0][1], b[1][0], b[1][1]],
    }))
  }, [])

  return (
    <Map
      longitude={viewState.longitude}
      latitude={viewState.latitude}
      zoom={viewState.zoom}
      onMove={handleMove}
      onMoveEnd={handleMoveEnd}
      onLoad={handleLoad}
      mapStyle="https://tiles.openfreemap.org/styles/dark"
      style={{ width: '100%', height: '100%' }}
      minZoom={3}
      maxZoom={14}
    >
      <NavigationControl position="top-right" />

      {clusters.map((feat) => {
        const [lon, lat] = feat.geometry.coordinates
        const props = feat.properties as Record<string, number | boolean | undefined>

        if (props.cluster) {
          return (
            <ClusterMarker
              key={`c-${props.cluster_id}`}
              count={props.point_count as number}
              lat={lat}
              lon={lon}
              onClick={() => {
                const zoom = cluster.getClusterExpansionZoom(props.cluster_id as number)
                setViewState((prev) => ({ ...prev, longitude: lon, latitude: lat, zoom }))
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
            latitude={lat}
            longitude={lon}
            onClick={(e) => {
              e.originalEvent.stopPropagation()
              onEventSelect(event)
            }}
          >
            <div
              className={event.status === 'open' ? 'marker-pulse' : ''}
              style={{
                width: isSelected ? 18 : 14,
                height: isSelected ? 18 : 14,
                borderRadius: '50%',
                backgroundColor: CATEGORY_COLORS[event.category],
                border: isSelected ? '2px solid #fff' : '2px solid rgba(255,255,255,0.4)',
                cursor: 'pointer',
                transition: 'width 0.15s, height 0.15s',
              }}
            />
          </Marker>
        )
      })}
    </Map>
  )
}
