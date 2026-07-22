import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { NaturalEvent } from '@/lib/types'
import { CATEGORY_EMOJIS } from '@/lib/types'

interface Props {
  events: NaturalEvent[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MAX_RESULTS = 8

export default function CommandPalette({ events, open, onOpenChange: setOpen }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const navigate = useNavigate()

  // Reset search state whenever the palette transitions to open, regardless
  // of what triggered it (Ctrl-K or the FilterBar button) — adjusted during
  // render rather than in an effect, per React's recommended pattern.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setActiveIndex(0)
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return events.slice(0, MAX_RESULTS)
    return events
      .filter((e) => e.title.toLowerCase().includes(q) || e.place_name?.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS)
  }, [events, query])

  function select(event: NaturalEvent) {
    setOpen(false)
    navigate(`/event/${event.id}`)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1400] flex items-start justify-center pt-24 px-4 bg-black/50" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden bg-surface border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={16} className="text-muted flex-shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter' && results[activeIndex]) {
                select(results[activeIndex])
              }
            }}
            placeholder="Search events by title or place&hellip;"
            className="flex-1 bg-transparent text-sm text-text placeholder:text-muted focus:outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted flex-shrink-0">Esc</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && <p className="px-4 py-6 text-sm text-muted text-center">No matching events.</p>}
          {results.map((event, i) => (
            <button
              key={event.id}
              onClick={() => select(event)}
              onMouseEnter={() => setActiveIndex(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{ backgroundColor: i === activeIndex ? 'var(--surface-2)' : 'transparent' }}
            >
              <span className="text-lg flex-shrink-0">{CATEGORY_EMOJIS[event.category]}</span>
              <div className="min-w-0">
                <p className="text-sm truncate">{event.title}</p>
                {event.place_name && <p className="text-xs text-muted truncate">{event.place_name}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
