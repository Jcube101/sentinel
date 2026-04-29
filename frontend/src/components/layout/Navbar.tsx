import { Link } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6"
      style={{
        height: 56,
        backgroundColor: '#0a0a0f',
        borderBottom: '1px solid #2a2a3a',
      }}
    >
      <Link
        to="/"
        className="text-sm font-bold tracking-widest"
        style={{ color: '#f97316', fontFamily: 'monospace' }}
      >
        SENTINEL
      </Link>
      <Link
        to="/dashboard"
        className="text-xs font-medium px-4 py-2 rounded-lg transition-colors"
        style={{ backgroundColor: '#f97316', color: '#fff' }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#ea6a0a')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f97316')}
      >
        View Live Map &rarr;
      </Link>
    </nav>
  )
}
