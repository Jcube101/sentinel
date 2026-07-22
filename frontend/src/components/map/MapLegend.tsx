import { CATEGORY_COLORS, CATEGORY_EMOJIS } from '@/lib/types'

const CATEGORIES = ['fire', 'flood', 'cyclone', 'earthquake'] as const

export default function MapLegend() {
  return (
    <div
      className="hidden sm:block absolute left-1/2 -translate-x-1/2 bottom-3 z-[1000] rounded-lg px-3 py-2 border border-border backdrop-blur-sm"
      style={{ backgroundColor: 'rgba(22,22,31,0.9)' }}
    >
      <div className="flex items-center gap-3">
        {CATEGORIES.map((cat) => (
          <span key={cat} className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
            <span
              className="inline-block rounded-full flex-shrink-0"
              style={{ width: 8, height: 8, backgroundColor: CATEGORY_COLORS[cat] }}
            />
            {CATEGORY_EMOJIS[cat]} <span className="capitalize">{cat}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
