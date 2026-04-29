import { ExternalLink } from 'lucide-react'

export default function Footer() {
  return (
    <footer
      className="px-4 sm:px-6 py-8"
      style={{ backgroundColor: '#0a0a0f', borderTop: '1px solid #2a2a3a' }}
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm" style={{ color: '#7070a0' }}>
          Sentinel &mdash; India Disaster Tracker
        </span>
        <a
          href="https://github.com/Jcube101/sentinel"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
          style={{ color: '#f97316' }}
        >
          <ExternalLink size={16} />
          GitHub
        </a>
      </div>
      <p
        className="text-xs text-center mt-4"
        style={{ color: '#7070a0' }}
      >
        Data refreshes daily at 6:30 AM IST
      </p>
    </footer>
  )
}
