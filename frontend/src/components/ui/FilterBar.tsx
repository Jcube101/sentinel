import type { EventFilters } from '@/lib/types'
import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'

const CATEGORIES = ['fire', 'flood', 'cyclone', 'earthquake'] as const
const STATUSES = ['open', 'all', 'closed'] as const
const DAYS = [7, 30, 90] as const

interface Props {
  filters: EventFilters
  onChange: (filters: EventFilters) => void
  totalCount: number
}

export default function FilterBar({ filters, onChange, totalCount }: Props) {
  function toggleCategory(cat: (typeof CATEGORIES)[number]) {
    const has = filters.categories.includes(cat)
    const next = has
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat]
    onChange({ ...filters, categories: next })
  }

  return (
    <div
      className="flex items-center gap-2 px-4 py-2 overflow-x-auto"
      style={{ backgroundColor: '#111118', borderBottom: '1px solid #2a2a3a' }}
    >
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
                : { backgroundColor: '#16161f', border: '1px solid #2a2a3a', color: '#7070a0' }
            }
          >
            {CATEGORY_EMOJIS[cat]} {cat}
          </button>
        )
      })}

      <div className="w-px h-5 mx-1" style={{ backgroundColor: '#2a2a3a' }} />

      {STATUSES.map((s) => {
        const active = filters.status === s
        return (
          <button
            key={s}
            onClick={() => onChange({ ...filters, status: s })}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors"
            style={
              active
                ? { backgroundColor: '#f9731633', border: '1px solid #f97316', color: '#f97316' }
                : { backgroundColor: '#16161f', border: '1px solid #2a2a3a', color: '#7070a0' }
            }
          >
            {s}
          </button>
        )
      })}

      <div className="w-px h-5 mx-1" style={{ backgroundColor: '#2a2a3a' }} />

      {DAYS.map((d) => {
        const active = filters.days === d
        return (
          <button
            key={d}
            onClick={() => onChange({ ...filters, days: d })}
            className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors"
            style={
              active
                ? { backgroundColor: '#f9731633', border: '1px solid #f97316', color: '#f97316' }
                : { backgroundColor: '#16161f', border: '1px solid #2a2a3a', color: '#7070a0' }
            }
          >
            {d}d
          </button>
        )
      })}

      <div className="ml-auto pl-4 hidden sm:block">
        <span className="text-sm whitespace-nowrap" style={{ color: '#7070a0' }}>
          {totalCount} events
        </span>
      </div>
    </div>
  )
}
