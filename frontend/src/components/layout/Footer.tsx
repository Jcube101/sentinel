import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'

const LINKS = [
  { to: '/map', label: 'Live Map' },
  { to: '/insights', label: 'Insights' },
  { to: '/about', label: 'About' },
]

export default function Footer() {
  return (
    <footer className="px-4 sm:px-6 py-8 bg-bg border-t border-border">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-muted">Sentinel &mdash; India Disaster Tracker</span>
        <div className="flex items-center gap-6">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="text-sm text-muted transition-colors hover:text-text">
              {link.label}
            </Link>
          ))}
          <a
            href="https://github.com/Jcube101/sentinel"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-accent transition-opacity hover:opacity-80"
          >
            <ExternalLink size={16} />
            GitHub
          </a>
        </div>
      </div>
      <p className="text-xs text-center mt-4 text-muted">Data refreshes 3&times; daily (09:00, 15:00, 21:00 UTC)</p>
    </footer>
  )
}
