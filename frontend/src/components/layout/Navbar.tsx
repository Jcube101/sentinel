import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'

const LINKS = [
  { to: '/map', label: 'Map' },
  { to: '/insights', label: 'Insights' },
  { to: '/about', label: 'About' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[1300] flex items-center justify-between px-4 sm:px-6 bg-bg border-b border-border"
      style={{ height: 56 }}
    >
      <div className="flex items-center gap-8">
        <Link to="/" className="text-sm font-bold tracking-widest text-accent font-mono" onClick={() => setOpen(false)}>
          SENTINEL
        </Link>
        <div className="hidden sm:flex items-center gap-6">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors hover:text-text ${isActive ? 'text-text' : 'text-muted'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/map"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white transition-colors hover:bg-accent-hover"
        >
          View Live Map &rarr;
        </Link>
        <button
          className="sm:hidden p-1.5 rounded text-muted hover:text-text transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="sm:hidden absolute top-[56px] left-0 right-0 bg-bg border-b border-border flex flex-col p-4 gap-3">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `text-sm font-medium transition-colors ${isActive ? 'text-text' : 'text-muted'}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <Link
            to="/map"
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-accent text-white"
          >
            View Live Map &rarr;
          </Link>
        </div>
      )}
    </nav>
  )
}
