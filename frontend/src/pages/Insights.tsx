import { useMemo } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import { useNaturalEvents } from '@/hooks/useNaturalEvents'
import { useAqiReadings } from '@/hooks/useAqiReadings'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'
import type { AqiReading } from '@/lib/types'

const WINDOW_DAYS = 90
const CATEGORIES: Array<'fire' | 'flood' | 'cyclone' | 'earthquake'> = ['fire', 'flood', 'cyclone', 'earthquake']
const SEVERITY_LABELS = ['low', 'medium', 'high', 'extreme'] as const

const CHART_MUTED = '#7070a0'
const CHART_BORDER = '#2a2a3a'
const CHART_SURFACE = '#16161f'

const tooltipStyle = {
  backgroundColor: CHART_SURFACE,
  border: `1px solid ${CHART_BORDER}`,
  borderRadius: 8,
  fontSize: 12,
}

function dayKey(iso: string): string {
  return iso.slice(0, 10)
}

function dayLabel(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// PM2.5 bands mirrored from AqiPanel — indicative, not a certified AQI calc.
function pm25Color(value: number): string {
  if (value <= 30) return '#22c55e'
  if (value <= 60) return '#eab308'
  if (value <= 90) return '#f97316'
  if (value <= 120) return '#ef4444'
  return '#991b1b'
}

function formatDuration(ms: number): string {
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`
}

export default function Insights() {
  const { data, isLoading } = useNaturalEvents({ categories: [], status: 'all', days: WINDOW_DAYS })
  const events = useMemo(() => data ?? [], [data])
  const { data: aqiData } = useAqiReadings()

  // Events by category over time — daily buckets for the full window.
  const timeSeries = useMemo(() => {
    const buckets = new Map<string, Record<string, number>>()
    const today = new Date()
    for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const key = d.toISOString().slice(0, 10)
      buckets.set(key, { fire: 0, flood: 0, cyclone: 0, earthquake: 0 })
    }
    for (const e of events) {
      const key = dayKey(e.started_at)
      const row = buckets.get(key)
      if (row) row[e.category] += 1
    }
    return [...buckets.entries()].map(([key, counts]) => ({ date: dayLabel(key), ...counts }))
  }, [events])

  // Severity distribution, faceted per category — bucketed by the shared
  // normalized severity label since raw severity_value units aren't
  // comparable even within a category (USGS magnitude vs GDACS alert-level
  // numerics for earthquakes, for example).
  const severityByCategory = useMemo(() => {
    const result: Record<string, Array<{ label: string; count: number }>> = {}
    for (const cat of CATEGORIES) {
      const counts: Record<string, number> = { low: 0, medium: 0, high: 0, extreme: 0 }
      for (const e of events) {
        if (e.category !== cat) continue
        const label = e.severity?.toLowerCase()
        if (label && label in counts) counts[label] += 1
      }
      result[cat] = SEVERITY_LABELS.map((label) => ({ label, count: counts[label] }))
    }
    return result
  }, [events])

  // Most-affected regions — events without a place_name (mostly raw FIRMS
  // hotspots) are excluded rather than lumped into "Unknown", which would
  // otherwise dwarf every real place in the ranking.
  const topRegions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events) {
      if (!e.place_name) continue
      counts.set(e.place_name, (counts.get(e.place_name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([place, count]) => ({ place, count }))
      .reverse()
  }, [events])

  // Open vs closed + median duration
  const { openCount, closedCount, medianDurationMs } = useMemo(() => {
    let open = 0
    let closed = 0
    const durations: number[] = []
    for (const e of events) {
      if (e.status === 'open') open += 1
      else closed += 1
      if (e.closed_at) {
        durations.push(new Date(e.closed_at).getTime() - new Date(e.started_at).getTime())
      }
    }
    durations.sort((a, b) => a - b)
    const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : null
    return { openCount: open, closedCount: closed, medianDurationMs: median }
  }, [events])

  // AQI leaderboard — worst current PM2.5 stations
  const aqiLeaderboard = useMemo(() => {
    const byLocation = new Map<string, AqiReading[]>()
    for (const r of aqiData ?? []) {
      const list = byLocation.get(r.location_id) ?? []
      list.push(r)
      byLocation.set(r.location_id, list)
    }
    const rows: Array<{ name: string; pm25: number; others: string }> = []
    for (const rowsForLocation of byLocation.values()) {
      const latestByParam = new Map<string, AqiReading>()
      for (const r of rowsForLocation) {
        const existing = latestByParam.get(r.parameter)
        if (!existing || new Date(r.recorded_at) > new Date(existing.recorded_at)) latestByParam.set(r.parameter, r)
      }
      const pm25 = latestByParam.get('pm25')?.value
      if (pm25 == null) continue
      const others = [...latestByParam.values()]
        .filter((r) => r.parameter !== 'pm25')
        .map((r) => `${r.parameter.toUpperCase()} ${r.value}${r.unit}`)
        .join(' · ')
      rows.push({ name: rowsForLocation[0].location_name, pm25, others })
    }
    return rows.sort((a, b) => b.pm25 - a.pm25).slice(0, 8)
  }, [aqiData])

  return (
    <div className="min-h-screen bg-bg text-text">
      <Navbar />

      <section className="max-w-5xl mx-auto px-4 pt-28 pb-16">
        <span className="text-xs font-bold tracking-[0.3em] uppercase text-accent font-mono">Insights</span>
        <h1 className="text-3xl sm:text-4xl font-bold mt-3 mb-2">Analytics</h1>
        <p className="text-base text-muted">
          Derived from the last {WINDOW_DAYS} days of events and current air-quality readings.
        </p>
      </section>

      {isLoading ? (
        <section className="max-w-5xl mx-auto px-4 pb-24">
          <div className="h-64 rounded-xl bg-surface border border-border animate-pulse" />
        </section>
      ) : (
        <>
          {/* Events over time */}
          <ChartCard title="Events by category" subtitle={`Daily counts over the last ${WINDOW_DAYS} days`}>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={timeSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke={CHART_BORDER} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: CHART_MUTED, fontSize: 11 }} interval={13} axisLine={{ stroke: CHART_BORDER }} tickLine={false} />
                <YAxis tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f0f0f5' }} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: CHART_MUTED }}
                  formatter={(value: string) => `${CATEGORY_EMOJIS[value as keyof typeof CATEGORY_EMOJIS]} ${value}`}
                />
                {CATEGORIES.map((cat) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stackId="events"
                    stroke={CATEGORY_COLORS[cat]}
                    fill={CATEGORY_COLORS[cat]}
                    fillOpacity={0.55}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Severity distribution, faceted */}
          <ChartCard title="Severity distribution" subtitle="Event counts by normalized severity, per category">
            <div className="grid sm:grid-cols-2 gap-6">
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="text-sm font-medium mb-2">
                    {CATEGORY_EMOJIS[cat]} <span className="capitalize">{cat}</span>
                  </p>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={severityByCategory[cat]} margin={{ top: 0, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke={CHART_BORDER} vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={{ stroke: CHART_BORDER }} tickLine={false} />
                      <YAxis tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f0f0f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="count" fill={CATEGORY_COLORS[cat]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Most affected regions */}
          <ChartCard title="Most-affected regions" subtitle="Top locations by event count">
            {topRegions.length === 0 ? (
              <p className="text-sm text-muted">No location data in this window.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topRegions.length * 34)}>
                <BarChart data={topRegions} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_BORDER} horizontal={false} />
                  <XAxis type="number" tick={{ fill: CHART_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="place"
                    width={140}
                    tick={{ fill: '#f0f0f5', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#f0f0f5' }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Open vs closed + median duration */}
          <ChartCard title="Open vs. closed" subtitle="Event lifecycle over the window">
            <div className="grid sm:grid-cols-3 gap-6 items-center">
              <Stat label="Open" value={openCount} color="#22c55e" />
              <Stat label="Closed" value={closedCount} color={CHART_MUTED} />
              <Stat
                label="Median duration"
                value={medianDurationMs != null ? formatDuration(medianDurationMs) : '—'}
                color="#f0f0f5"
              />
            </div>
            {openCount + closedCount > 0 && (
              <div className="flex h-2 rounded-full overflow-hidden mt-6 bg-border">
                <div style={{ width: `${(openCount / (openCount + closedCount)) * 100}%`, backgroundColor: '#22c55e' }} />
                <div style={{ width: `${(closedCount / (openCount + closedCount)) * 100}%`, backgroundColor: CHART_MUTED }} />
              </div>
            )}
          </ChartCard>

          {/* AQI leaderboard */}
          <ChartCard title="AQI leaderboard" subtitle="Worst current PM2.5 stations (last 24h)">
            {aqiLeaderboard.length === 0 ? (
              <p className="text-sm text-muted">No AQI readings in the last 24 hours.</p>
            ) : (
              <div className="space-y-2">
                {aqiLeaderboard.map((row) => (
                  <div key={row.name} className="flex items-center gap-3">
                    <span className="text-sm w-40 truncate flex-shrink-0">{row.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (row.pm25 / 150) * 100)}%`,
                          backgroundColor: pm25Color(row.pm25),
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono w-16 text-right flex-shrink-0" style={{ color: pm25Color(row.pm25) }}>
                      {row.pm25.toFixed(0)}
                    </span>
                    {row.others && <span className="text-xs text-muted hidden sm:block truncate flex-shrink-0 max-w-[220px]">{row.others}</span>}
                  </div>
                ))}
              </div>
            )}
          </ChartCard>
        </>
      )}

      <Footer />
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="max-w-5xl mx-auto px-4 pb-10">
      <div className="rounded-2xl p-6 bg-surface border border-border">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-xs text-muted mb-4">{subtitle}</p>
        {children}
      </div>
    </section>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  )
}
