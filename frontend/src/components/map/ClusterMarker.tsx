import { Marker } from 'react-map-gl/maplibre'

interface Props {
  count: number
  lat: number
  lon: number
  onClick: () => void
}

export default function ClusterMarker({ count, lat, lon, onClick }: Props) {
  const size = count < 10 ? 24 : count < 100 ? 32 : 40

  return (
    <Marker latitude={lat} longitude={lon} onClick={onClick}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)',
          border: '1.5px solid rgba(255,255,255,0.3)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {count}
      </div>
    </Marker>
  )
}
