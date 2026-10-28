import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Level } from '@/lib/desk/types'
import { INDIA_OUTLINE } from '@/lib/desk/where'

// Esri's light grey canvas, keyless, {z}/{y}/{x} like the old dark tiles;
// index.css warms it toward the paper palette (.paper-map).
const BASE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const INDIA_CENTER: [number, number] = [22.6, 81.0]

export interface MapItem {
  key: string
  /** The desk row's number; null for closed items. */
  number: number | null
  level: Level
  lat: number
  lon: number
  title: string
  closed: boolean
}

export interface FirePoint {
  latitude: number
  longitude: number
  hotspot_count: number
  frp_max: number
  district: string | null
  state: string | null
}

function itemIcon(m: MapItem, selected: boolean): L.DivIcon {
  const size = selected ? 26 : 22
  const bg = m.closed ? '#F3F0E8' : m.level >= 4 ? '#A8221B' : '#17171B'
  const fg = m.closed ? '#5C5A55' : '#F3F0E8'
  const ring = selected ? 'box-shadow:0 0 0 3px #F3F0E8,0 0 0 4px #A8221B;' : ''
  const border = m.closed ? '1px dashed #5C5A55' : '1px solid #F3F0E8'
  const label = m.number ?? '·'
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${bg};color:${fg};border:${border};${ring}display:flex;align-items:center;justify-content:center;font:600 12px 'IBM Plex Mono',monospace;box-sizing:border-box">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * The day's fires as dots, sized to the zoom: at country scale a dot must
 * stay well under the width of a border district, or fires near Pakistan,
 * Nepal or Bangladesh look as if they were across the border.
 */
function FireDots({ fires, interactive }: { fires: FirePoint[]; interactive: boolean }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const radius = (f: FirePoint) => (zoom <= 4 ? 1.4 : zoom === 5 ? 1.8 : zoom === 6 ? 2.6 : Math.min(7, 2 + Math.sqrt(f.hotspot_count)))
  return (
    <>
      {fires.map((f, i) => (
        <CircleMarker
          key={i}
          center={[f.latitude, f.longitude]}
          radius={radius(f)}
          pathOptions={{ color: '#A8221B', weight: 0, fillColor: '#A8221B', fillOpacity: 0.6 }}
          interactive={interactive}
        >
          {interactive && (
            <Tooltip>
              {f.district ?? 'Fire'}
              {f.state ? `, ${f.state}` : ''} · {f.hotspot_count} {f.hotspot_count === 1 ? 'hotspot' : 'hotspots'}
            </Tooltip>
          )}
        </CircleMarker>
      ))}
    </>
  )
}

/** Pans to the selected item when it changes. */
function Focus({ at }: { at: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (at) map.flyTo(at, Math.max(map.getZoom(), 6), { duration: 0.6 })
  }, [at, map])
  return null
}

interface Props {
  items: MapItem[]
  fires: FirePoint[]
  interactive?: boolean
  zoom?: number
  center?: [number, number]
  selected?: string | null
  onSelect?: (key: string) => void
  className?: string
}

/** The paper map: numbered desk items and the day's fires. Leaflet raster tiles, no WebGL. */
export default function PaperMap({ items, fires, interactive = true, zoom = 5, center = INDIA_CENTER, selected = null, onSelect, className = '' }: Props) {
  const focus = items.find((m) => m.key === selected)
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      preferCanvas
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      boxZoom={interactive}
      attributionControl={interactive}
      className={`paper-map ${className}`}
    >
      <TileLayer url={BASE_URL} attribution={ATTRIBUTION} zIndex={1} />
      <TileLayer url={LABELS_URL} zIndex={2} />
      {/* India's official outline (simplified), so fires along a border read as India's. */}
      <Polygon positions={INDIA_OUTLINE} interactive={false} pathOptions={{ color: '#17171B', weight: 0.8, opacity: 0.55, fill: false }} />
      <FireDots fires={fires} interactive={interactive} />
      {items.map((m) => (
        <Marker
          key={m.key}
          position={[m.lat, m.lon]}
          icon={itemIcon(m, m.key === selected)}
          interactive={interactive}
          eventHandlers={onSelect ? { click: () => onSelect(m.key) } : undefined}
          zIndexOffset={m.key === selected ? 1000 : m.level * 100}
        >
          {interactive && <Tooltip direction="top" offset={[0, -12]}>{m.title}</Tooltip>}
        </Marker>
      ))}
      {interactive && <Focus at={focus ? [focus.lat, focus.lon] : null} />}
    </MapContainer>
  )
}
