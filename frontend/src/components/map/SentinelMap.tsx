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
  isLoading?: boolean
}

interface ViewState {
  longitude: number
  latitude: number
  zoom: number
  bounds: [number, number, number, number] | null
}

// MapLibre needs a working WebGL context. When one cannot be created (hardware
// acceleration disabled, GPU driver blocklisted, WebGL turned off), the map
// mounts nothing at all: no tiles, no controls, no attribution, just a blank
// void that reads as "the map is gone". Probe once so we can show a real
// message instead of that void.
function webglAvailable(): boolean {
  if (typeof document === 'undefined') return true
  try {
    const canvas = document.createElement('canvas')
    return !!(
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    )
  } catch {
    return false
  }
}

export default function SentinelMap({ events, onEventSelect, selectedEvent, isLoading }: Props) {
  const [viewState, setViewState] = useState<ViewState>({
    longitude: 82.8,
    latitude: 22.5,
    zoom: 4.2,
    bounds: null,
  })

  const webglOk = useMemo(webglAvailable, [])

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

  if (!webglOk) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
          textAlign: 'center',
          background: '#0a0a0f',
          color: '#7070a0',
        }}
      >
        <div style={{ color: '#f97316', fontSize: 15, fontWeight: 600 }}>
          Map unavailable
        </div>
        <div style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.5 }}>
          This map needs WebGL, which your browser could not start. Enable
          hardware acceleration (or WebGL) and reload. The event list and stats
          below still work without it.
        </div>
      </div>
    )
  }

  return (
    <>
      {isLoading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(10,10,15,0.7)',
          color: '#7070a0',
          fontSize: '14px',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          Loading events...
        </div>
      )}
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
    </>
  )
}
