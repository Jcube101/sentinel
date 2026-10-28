import { Fragment, useEffect, useMemo, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polygon, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import type { Category, Level } from '@/lib/desk/types'
import { INDIA_OUTLINE } from '@/lib/desk/where'
import {
  ACCENT,
  AIR_LABEL,
  AIR_TINT,
  airLabel,
  airSquareHtml,
  fireDot,
  markerBoxes,
  markerHtml,
  placeLabel,
  type AirPoint,
  type LabelSide,
} from './mapSymbols'

// Esri's light grey canvas, keyless, {z}/{y}/{x} like the old dark tiles;
// index.css warms it toward the paper palette (.paper-map).
const BASE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
const LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
const ATTRIBUTION = 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const INDIA_CENTER: [number, number] = [22.6, 81.0]

export interface MapItem {
  key: string
  category: Category
  /** Sizes a cyclone's spiral: its wind in km/h; else null. */
  strength: number | null
  /** A fire item's state: its dots take the state's level. */
  state: string | null
  /** The desk row's number; null for none (closed items, a quake group's smaller quakes). */
  number: number | null
  level: Level
  lat: number
  lon: number
  title: string
  closed: boolean
  /** A Level 4 fire state's large fires near towns (fire_events ids): ringed on the map. */
  ringed?: number[]
}

export interface FirePoint {
  /** fire_events.id; matches large_fires_near_people[].fire_event. */
  id?: number
  latitude: number
  longitude: number
  hotspot_count: number
  frp_max: number
  district: string | null
  state: string | null
}

function itemIcon(m: MapItem, selected: boolean, scale: number): L.DivIcon {
  const { html, size } = markerHtml(m, selected, scale)
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

function airIcon(p: AirPoint, side: LabelSide | null): L.DivIcon {
  const { html, size } = airSquareHtml(p, side)
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

/** The map's zoom, kept current, for layers that size or place things in pixels. */
function useZoom(): number {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  return zoom
}

/**
 * The day's fires as dots, sized to the zoom: at country scale a dot must
 * stay well under the width of a border district, or fires near Pakistan,
 * Nepal or Bangladesh look as if they were across the border. Each dot takes
 * its state's level (ember, stronger above normal, red from Level 3); a large
 * fire near a town in a Level 4 state is ringed.
 */
function FireDots({
  fires,
  interactive,
  levels,
  ringed,
}: {
  fires: FirePoint[]
  interactive: boolean
  levels: Map<string, Level>
  ringed: Set<number>
}) {
  const zoom = useZoom()
  const radius = (f: FirePoint) => (zoom <= 4 ? 1.4 : zoom === 5 ? 1.8 : zoom === 6 ? 2.6 : Math.min(7, 2 + Math.sqrt(f.hotspot_count)))
  return (
    <>
      {fires.map((f, i) => {
        const dot = fireDot((f.state && levels.get(f.state)) || 0)
        return (
          <CircleMarker
            key={f.id ?? i}
            center={[f.latitude, f.longitude]}
            radius={radius(f)}
            pathOptions={{ weight: 0, fillColor: dot.color, fillOpacity: dot.opacity }}
            interactive={interactive}
          >
            {interactive && (
              <Tooltip>
                {f.district ?? 'Fire'}
                {f.state ? `, ${f.state}` : ''} · {f.hotspot_count} {f.hotspot_count === 1 ? 'hotspot' : 'hotspots'}
              </Tooltip>
            )}
          </CircleMarker>
        )
      })}
      {fires
        .filter((f) => f.id !== undefined && ringed.has(f.id))
        .map((f) => (
          <Fragment key={`ring:${f.id}`}>
            <Circle center={[f.latitude, f.longitude]} radius={9000} interactive={false} pathOptions={{ stroke: false, fillColor: ACCENT, fillOpacity: 0.1 }} />
            <CircleMarker center={[f.latitude, f.longitude]} radius={7} interactive={false} pathOptions={{ color: ACCENT, weight: 1.6, fill: false }} />
          </Fragment>
        ))}
    </>
  )
}

/**
 * Air under every hazard: its own pane below the fire dots (overlay pane,
 * 400) and the symbols (markers, 600). Only the worst city is named, on the
 * side of its square clear of every marker; with no clear side, no label
 * (Job, 28 Oct: Delhi's was cut off by the Punjab fire badge).
 */
function AirLayer({ air, items, scale }: { air: AirPoint[]; items: MapItem[]; scale: number }) {
  const map = useMap()
  const zoom = useZoom()
  const side = useMemo(() => {
    const worst = air[0]
    if (!worst) return null
    const at = (lat: number, lon: number) => map.project([lat, lon], zoom)
    const obstacles = items.flatMap((m) => markerBoxes(m, at(m.lat, m.lon), scale))
    return placeLabel(at(worst.lat, worst.lon), AIR_TINT[worst.band].size, airLabel(worst).w, AIR_LABEL.height, obstacles)
  }, [air, items, scale, map, zoom])
  return (
    <Pane name="air" style={{ zIndex: 350 }}>
      {air.map((p, i) => (
        <Marker key={p.city} pane="air" position={[p.lat, p.lon]} icon={airIcon(p, i === 0 ? side : null)} interactive={false} keyboard={false} />
      ))}
    </Pane>
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
  /** Cities at poor or worse, worst first; the first is labelled. Empty until the air figures carry positions (P5). */
  air?: AirPoint[]
}

/**
 * The paper map: the items' hazard symbols, numbered as on the desk, over the
 * day's fires, over the air squares. Leaflet raster tiles, no WebGL.
 */
export default function PaperMap({
  items,
  fires,
  interactive = true,
  zoom = 5,
  center = INDIA_CENTER,
  selected = null,
  onSelect,
  className = '',
  air = [],
}: Props) {
  const focus = items.find((m) => m.key === selected)
  // Each fire state's level, for its dots; and the large fires to ring.
  const levels = new Map<string, Level>()
  for (const m of items) {
    if (m.category === 'fire' && m.state && !m.closed) levels.set(m.state, Math.max(levels.get(m.state) ?? 1, m.level) as Level)
  }
  const ringed = new Set(items.flatMap((m) => (m.closed ? [] : (m.ringed ?? []))))
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
      {air.length > 0 && <AirLayer air={air} items={items} scale={scale} />}
      <FireDots fires={fires} interactive={interactive} levels={levels} ringed={ringed} />
      {items.map((m) => (
        <Marker
          key={m.key}
          position={[m.lat, m.lon]}
          icon={itemIcon(m, m.key === selected, scale)}
          interactive={interactive}
          // On the still maps markers aren't buttons; on the full map each is one, named by its title.
          keyboard={interactive}
          title={interactive ? m.title : undefined}
          eventHandlers={onSelect ? { click: () => onSelect(m.key) } : undefined}
          zIndexOffset={m.key === selected ? 1000 : m.level * 100}
        >
          {interactive && (
            <Tooltip direction="top" offset={[0, -12]}>
              {m.title}
            </Tooltip>
          )}
        </Marker>
      ))}
      {interactive && <Focus at={focus ? [focus.lat, focus.lon] : null} />}
    </MapContainer>
  )
}
