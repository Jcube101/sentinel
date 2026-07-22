import { Search, X } from 'lucide-react'
import type { EventFilters } from '@/lib/types'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'

const CATEGORIES = ['fire', 'flood', 'cyclone', 'earthquake'] as const
const STATUSES = ['open', 'all', 'closed'] as const
const DAYS = [7, 30, 90] as const

const DEFAULT_FILTERS: EventFilters = { categories: [], status: 'open', days: 30 }
const ACCENT_HEX = '#f97316'

interface Props {
  filters: EventFilters
  onChange: (filters: EventFilters) => void
  totalCount: number
  showAqi: boolean
  onToggleAqi: () => void
  aqiCount: number
  onSearchClick: () => void
}

// Tailwind can't apply opacity modifiers to colors sourced from CSS
// variables (our tokens), so the active state uses an inline hex+alpha
// background instead of e.g. `bg-accent/20`.
function pillStyle(active: boolean): React.CSSProperties {
  return active
    ? { backgroundColor: ACCENT_HEX + '33', border: `1px solid ${ACCENT_HEX}`, color: ACCENT_HEX }
    : { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold uppercase tracking-wider text-muted mr-1 flex-shrink-0">{children}</span>
}

export default function FilterBar({ filters, onChange, totalCount, showAqi, onToggleAqi, aqiCount, onSearchClick }: Props) {
  function toggleCategory(cat: (typeof CATEGORIES)[number]) {
    const has = filters.categories.includes(cat)
    const next = has ? filters.categories.filter((c) => c !== cat) : [...filters.categories, cat]
    onChange({ ...filters, categories: next })
  }

  const isDefault =
    filters.categories.length === 0 &&
    filters.status === DEFAULT_FILTERS.status &&
    filters.days === DEFAULT_FILTERS.days &&
    !showAqi

  function clearFilters() {
    onChange(DEFAULT_FILTERS)
    if (showAqi) onToggleAqi()
  }

  return (
    <div className="flex items-center gap-4 px-4 py-2 overflow-x-auto bg-surface-2 border-b border-border">
      <div className="flex items-center gap-1.5">
        <GroupLabel>Category</GroupLabel>
        {CATEGORIES.map((cat) => {
          const active = filters.categories.length === 0 || filters.categories.includes(cat)
          const color = CATEGORY_COLORS[cat]
          return (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
              style={
                active
                  ? { backgroundColor: color + '33', border: `1px solid ${color}`, color }
                  : { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
              }
            >
              {CATEGORY_EMOJIS[cat]} {cat}
            </button>
          )
        })}
      </div>

      <div className="w-px h-5 flex-shrink-0 bg-border" />

      <div className="flex items-center gap-1.5">
        <GroupLabel>Status</GroupLabel>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => onChange({ ...filters, status: s })}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors"
            style={pillStyle(filters.status === s)}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="w-px h-5 flex-shrink-0 bg-border" />

      <div className="flex items-center gap-1.5">
        <GroupLabel>Window</GroupLabel>
        {DAYS.map((d) => (
          <button
            key={d}
            onClick={() => onChange({ ...filters, days: d })}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
            style={pillStyle(filters.days === d)}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="w-px h-5 flex-shrink-0 bg-border" />

      <div className="flex items-center gap-1.5">
        <GroupLabel>AQI</GroupLabel>
        <button
          onClick={onToggleAqi}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
          style={
            showAqi
              ? { backgroundColor: 'rgba(249,115,22,0.2)', border: '1px solid var(--accent)', color: 'var(--accent)' }
              : { backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
          }
        >
          💨 AQI{aqiCount > 0 ? ` (${aqiCount})` : ''}
        </button>
      </div>

      {!isDefault && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-muted transition-colors hover:text-text flex-shrink-0"
        >
          <X size={12} />
          Clear filters
        </button>
      )}

      <div className="ml-auto pl-4 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={onSearchClick}
          title="Search events (⌘K)"
          className="p-1.5 rounded-lg text-muted transition-colors hover:text-text hover:bg-surface"
        >
          <Search size={14} />
        </button>
        <span className="hidden sm:block whitespace-nowrap">
          <span className="text-sm font-semibold text-text">{totalCount}</span>
          <span className="text-sm text-muted"> events</span>
        </span>
      </div>
    </div>
  )
}
