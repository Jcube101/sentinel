/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // The paper palette, from src/index.css.
      colors: {
        accent: 'var(--accent)',
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        rule: 'var(--rule)',
        fill: 'var(--fill)',
        'fill-strong': 'var(--fill-strong)',
        panel: 'var(--panel)',
        note: 'var(--note)',
      },
      fontFamily: {
        serif: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        cond: ['"IBM Plex Sans Condensed"', '"Arial Narrow"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
