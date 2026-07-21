import type { AqiReading } from '@/lib/types'
import { X } from 'lucide-react'

interface Props {
  readings: AqiReading[]
  isLoading: boolean
  onClose: () => void
}

interface StationSummary {
  location_id: string
  location_name: string
  city: string | null
  pm25: number | null
  pm25Trend: 'up' | 'down' | 'flat' | null
  otherParams: { parameter: string; value: number; unit: string }[]
  recorded_at: string
}

// Indicative PM2.5 bands (CPCB/EPA-style breakpoints), not a certified AQI
// calculation, good enough for an at-a-glance color.
function pm25Color(value: number): string {
  if (value <= 30) return '#22c55e'
  if (value <= 60) return '#eab308'
  if (value <= 90) return '#f97316'
  if (value <= 120) return '#ef4444'
  return '#991b1b'
}

function summarize(readings: AqiReading[]): StationSummary[] {
  const byLocation = new Map<string, AqiReading[]>()
  for (const r of readings) {
    const list = byLocation.get(r.location_id) ?? []
    list.push(r)
    byLocation.set(r.location_id, list)
  }

  const summaries: StationSummary[] = []
  for (const [location_id, rows] of byLocation) {
    const pm25Rows = rows
      .filter((r) => r.parameter === 'pm25')
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

    let pm25Trend: StationSummary['pm25Trend'] = null
    if (pm25Rows.length >= 2) {
      const delta = pm25Rows[pm25Rows.length - 1].value - pm25Rows[0].value
      pm25Trend = Math.abs(delta) < 1 ? 'flat' : delta > 0 ? 'up' : 'down'
    }

    const latestByParam = new Map<string, AqiReading>()
    for (const r of rows) {
      const existing = latestByParam.get(r.parameter)
      if (!existing || new Date(r.recorded_at) > new Date(existing.recorded_at)) {
        latestByParam.set(r.parameter, r)
      }
    }

    const latestOverall = [...latestByParam.values()].sort(
      (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
    )[0]

    summaries.push({
      location_id,
      location_name: rows[0].location_name,
      city: rows[0].city,
      pm25: latestByParam.get('pm25')?.value ?? null,
      pm25Trend,
      otherParams: [...latestByParam.values()]
        .filter((r) => r.parameter !== 'pm25')
        .map((r) => ({ parameter: r.parameter, value: r.value, unit: r.unit })),
      recorded_at: latestOverall.recorded_at,
    })
  }

  return summaries.sort((a, b) => (b.pm25 ?? -1) - (a.pm25 ?? -1))
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  return `${Math.round(mins / 60)}h ago`
}

export default function AqiPanel({ readings, isLoading, onClose }: Props) {
  const stations = summarize(readings)

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-[1100] sm:hidden"
        style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      <div
        className="fixed z-[1200] overflow-y-auto
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[60vh]
          sm:top-[56px] sm:left-0 sm:bottom-0 sm:right-auto sm:w-80 sm:rounded-none sm:max-h-none"
        style={{ backgroundColor: '#16161f', borderTop: '1px solid #2a2a3a', borderRight: '1px solid #2a2a3a' }}
      >
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-sm">Air Quality (last 24h)</h3>
            <button onClick={onClose} className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
              <X size={16} style={{ color: '#7070a0' }} />
            </button>
          </div>

          {isLoading && (
            <p className="text-xs" style={{ color: '#7070a0' }}>Loading...</p>
          )}
          {!isLoading && stations.length === 0 && (
            <p className="text-xs" style={{ color: '#7070a0' }}>No AQI readings in the last 24 hours.</p>
          )}

          <div className="space-y-3">
            {stations.map((s) => (
              <div key={s.location_id} className="pb-3" style={{ borderBottom: '1px solid #2a2a3a' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.location_name}</p>
                    {s.city && (
                      <p className="text-xs truncate" style={{ color: '#7070a0' }}>{s.city}</p>
                    )}
                  </div>
                  {s.pm25 != null && (
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: pm25Color(s.pm25) + '26', color: pm25Color(s.pm25) }}
                    >
                      PM2.5 {s.pm25.toFixed(0)}
                      {s.pm25Trend === 'up' && ' ↑'}
                      {s.pm25Trend === 'down' && ' ↓'}
                    </span>
                  )}
                </div>
                {s.otherParams.length > 0 && (
                  <p className="text-xs mt-1" style={{ color: '#7070a0' }}>
                    {s.otherParams.map((p) => `${p.parameter.toUpperCase()} ${p.value}${p.unit}`).join(' · ')}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: '#7070a0' }}>{timeAgo(s.recorded_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
