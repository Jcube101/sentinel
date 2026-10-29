import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import ScaleTable from './ScaleTable'
import type { Scale } from '@/lib/desk/scale'
import { useLatestScale } from '@/hooks/useEdition'

interface NavItem {
  to: string
  label: string
  /** Shown in the phone's bottom bar too (About is in the footer there). */
  phone: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Desk', phone: true },
  { to: '/map', label: 'Map', phone: true },
  { to: '/archive', label: 'Archive', phone: true },
  { to: '/sources', label: 'Sources', phone: true },
  { to: '/about', label: 'About', phone: false },
]

function isActive(item: NavItem, path: string): boolean {
  if (item.to === '/') return path === '/' || /^\/(edition|date|item)\//.test(path)
  if (item.to === '/archive') return path.startsWith('/archive')
  return path === item.to
}

function Masthead({ path }: { path: string }) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['latest-edition'] })
  return (
    <>
      <header className="hidden sm:flex flex-wrap items-end justify-between gap-4 pt-7 pb-3.5 border-b-4 border-ink">
        <Link to="/" className="flex flex-wrap items-baseline gap-[18px] hover:text-ink">
          <span className="font-cond font-bold text-[40px] tracking-[0.04em] leading-none">SENTINEL</span>
          <span className="font-mono text-[13px] tracking-[0.08em] uppercase">Situation report · India</span>
        </Link>
        <nav aria-label="Primary" className="flex gap-6 font-mono text-[13px] uppercase tracking-[0.06em]">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item, path) ? 'page' : undefined}
              className={`hover:text-accent ${isActive(item, path) ? 'border-b-2 border-accent pb-0.5' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <header className="sm:hidden flex justify-between items-center pt-[18px] pb-2.5 border-b-[3px] border-ink">
        <Link to="/" className="flex flex-col gap-0.5">
          <span className="font-cond font-bold text-[28px] tracking-[0.04em] leading-none">SENTINEL</span>
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase">Situation report · India</span>
        </Link>
        <button
          type="button"
          onClick={refresh}
          aria-label="Check for a newer edition"
          className="w-11 h-11 border border-ink flex items-center justify-center active:bg-note"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.7" />
            <path d="M20 4v5h-5" />
          </svg>
        </button>
      </header>
    </>
  )
}

function BottomNav({ path }: { path: string }) {
  return (
    <nav
      aria-label="Primary"
      className="sm:hidden fixed bottom-0 inset-x-0 z-[1000] grid grid-cols-4 border-t-[3px] border-ink bg-paper font-mono text-[11px] uppercase tracking-[0.06em] pb-[env(safe-area-inset-bottom)]"
    >
      {NAV.filter((i) => i.phone).map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={isActive(item, path) ? 'page' : undefined}
          className={`flex items-center justify-center min-h-[64px] ${
            isActive(item, path) ? 'font-semibold shadow-[inset_0_3px_0_var(--accent)]' : ''
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

/** "How levels are set", collapsed: the compact legend at the foot of every page. */
function Legend({ afterNotes, scale }: { afterNotes: boolean; scale?: Scale }) {
  return (
    <details className={`group ${afterNotes ? 'mt-8' : 'mt-12'} border-t border-ink`}>
      <summary className="flex justify-between items-center gap-3 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden font-mono text-[11px] sm:text-[12px] uppercase tracking-[0.08em]">
        <span>How levels are set</span>
        <span className="text-ink-muted tracking-[0.04em]">
          <span className="group-open:hidden">Show</span>
          <span className="hidden group-open:inline">Hide</span> <span className="inline-block transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="pb-4 max-w-[640px] flex flex-col gap-3">
        <p className="m-0 text-[14px] leading-[1.5] text-ink-muted">
          Every item gets a level from 1 (minor) to 4 (severe). Items are ranked by level, never by how many there are.
        </p>
        <ScaleTable names scale={scale} />
        <Link to="/about" className="self-start font-mono text-[12px] uppercase tracking-[0.06em] border-b border-ink hover:text-accent">
          The full explanation →
        </Link>
      </div>
    </details>
  )
}

interface Props {
  children: ReactNode
  /** The right-hand side of the footer: the edition's source line. */
  footer?: ReactNode
  /** The page's Notes (PageNotes), above the legend. */
  notes?: ReactNode
  /** The rules of the edition on the page, for the legend; else the latest edition's. */
  scale?: Scale
}

/** The newspaper frame every Situation Report page sits in. */
export default function PaperShell({ children, footer, notes, scale }: Props) {
  const { pathname } = useLocation()
  const latestScale = useLatestScale(scale === undefined && pathname !== '/about')
  return (
    <div className="min-h-screen bg-paper text-ink font-serif pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0">
      <a href="#content" className="skip-link">
        Skip to the report
      </a>
      <div className="max-w-[1360px] mx-auto px-5 sm:px-10 pb-6 sm:pb-14">
        <Masthead path={pathname} />
        <div id="content" tabIndex={-1} className="focus:outline-none">
          {children}
        </div>
        {notes}
        {pathname !== '/about' && <Legend afterNotes={!!notes} scale={scale ?? latestScale.data} />}
        <footer className={`${pathname !== '/about' ? 'mt-0' : 'mt-12'} pt-3 border-t border-ink flex flex-wrap justify-between gap-3 font-mono text-[10px] sm:text-[11px] leading-relaxed text-ink-muted tracking-[0.04em]`}>
          <span>
            SENTINEL · EDITIONS AT 02:30, 14:30 AND 20:30 IST, FROM A RASPBERRY PI ·{' '}
            <Link to="/about" className="border-b border-ink-muted hover:text-accent">
              ABOUT
            </Link>
          </span>
          {footer}
        </footer>
      </div>
      <BottomNav path={pathname} />
    </div>
  )
}
