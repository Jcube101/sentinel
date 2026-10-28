import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Category, Level } from '@/lib/desk/types'
import { INDIA_OUTLINE } from '@/lib/desk/where'
import { ACCENT, INK, PAPER, badgeHtml, symbolSize, symbolSvg } from './mapSymbols'

// Esri's light grey canvas, keyless, {z}/{y}/{x} like the old dark tiles;
// index.css warms it toward the paper palette (.paper-map).
const BASE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const INDIA_CENTER: [number, number] = [22.6, 81.0]

export interface MapItem {
  key: string
  category: Category
  /** Sizes the symbol: a cyclone's wind in km/h, a quake's magnitude; else null. */
  strength: number | null
  /** A fire item's state: its dots turn red at Level 3 and up. */
  state: string | null
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

/**
 * An item's marker: its hazard symbol with the rank badge on its shoulder. A
 * fire state has no symbol of its own (its fires are the dots), so its badge
 * sits at the centre of its fires. Closed items are dashed and unnumbered.
 */
function itemIcon(m: MapItem, selected: boolean, scale: number): L.DivIcon {
  const size = Math.round(symbolSize(m.category, m.strength) * scale)
  if (size === 0) {
    const ring = selected ? `box-shadow:0 0 0 2px ${PAPER},0 0 0 3.5px ${ACCENT};` : ''
    const html =
      m.number === null
        ? `<div style="width:8px;height:8px;border:1px dashed ${INK};background:${PAPER};box-sizing:border-box"></div>`
        : `<div style="position:relative;width:16px;height:16px;${ring}">${badgeHtml(m.number, m.level, 'left:0;top:0;')}</div>`
    const box = m.number === null ? 8 : 16
    return L.divIcon({ className: '', html, iconSize: [box, box], iconAnchor: [box / 2, box / 2] })
  }
  const pulse = m.level >= 4 && !m.closed ? `<span class="map-pulse" style="border-color:${ACCENT}"></span>` : ''
  const ring = selected ? `<span style="position:absolute;inset:-5px;border-radius:50%;background:${PAPER}cc;box-shadow:0 0 0 1.5px ${ACCENT}"></span>` : ''
  const badge = m.number === null ? '' : badgeHtml(m.number, m.level, `left:${Math.round(size * 0.68)}px;top:-8px;`)
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${size}px">${pulse}${ring}<span style="position:relative">${symbolSvg({ category: m.category, size, level: m.level, closed: m.closed })}</span>${badge}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * The day's fires as dots, sized to the zoom: at country scale a dot must
 * stay well under the width of a border district, or fires near Pakistan,
 * Nepal or Bangladesh look as if they were across the border. Ink, and red
 * only in a state whose fires are at Level 3 or above.
 */
function FireDots({ fires, interactive, hot }: { fires: FirePoint[]; interactive: boolean; hot: Set<string> }) {
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
          pathOptions={{ weight: 0, fillColor: f.state && hot.has(f.state) ? ACCENT : INK, fillOpacity: f.state && hot.has(f.state) ? 0.65 : 0.5 }}
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

/** The paper map: the items' hazard symbols, numbered as on the desk, over the day's fires. Leaflet raster tiles, no WebGL. */
export default function PaperMap({ items, fires, interactive = true, zoom = 5, center = INDIA_CENTER, selected = null, onSelect, className = '' }: Props) {
  const focus = items.find((m) => m.key === selected)
  const hot = new Set(items.filter((m) => m.category === 'fire' && m.level >= 3 && !m.closed && m.state).map((m) => m.state!))
  // The small, still maps (Desk and item sidebars) draw symbols a little smaller.
  const scale = interactive ? 1 : 0.8
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
      <FireDots fires={fires} interactive={interactive} hot={hot} />
      {items.map((m) => (
        <Marker
          key={m.key}
          position={[m.lat, m.lon]}
          icon={itemIcon(m, m.key === selected, scale)}
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
