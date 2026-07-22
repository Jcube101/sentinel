/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'cat-fire': 'var(--cat-fire)',
        'cat-flood': 'var(--cat-flood)',
        'cat-cyclone': 'var(--cat-cyclone)',
        'cat-earthquake': 'var(--cat-earthquake)',
        'sev-low': 'var(--sev-low)',
        'sev-mid': 'var(--sev-mid)',
        'sev-high': 'var(--sev-high)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
