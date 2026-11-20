import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // The installable app (PWA). The service worker is src/sw.ts: the plugin
    // builds it and injects the precache list (the app shell). autoUpdate: a
    // new version takes over and reloads the page on the first open after a
    // deploy. No service worker under `npm run dev`.
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registered in main.tsx (virtual:pwa-register)
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // The link-preview image is for other sites' crawlers, not the app:
        // no reason for every install to download it.
        globIgnores: ['og-image.png'],
      },
      manifest: {
        name: 'Sentinel — Situation Report',
        short_name: 'Sentinel',
        description: 'Natural hazards in India, ranked by severity and written as news, three times a day.',
        // The paper colour (--paper in src/index.css), as in index.html's theme-color.
        theme_color: '#F3F0E8',
        background_color: '#F3F0E8',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        // PNG: Chrome's install check doesn't take SVG. Drawn by scripts/gen-icons.mjs.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries in chunks of their own: they change far less often than
        // the site's code, so a deploy doesn't make readers fetch them again.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
            { name: 'query', test: /node_modules[\\/]@tanstack[\\/]/ },
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/ },
          ],
        },
      },
    },
  },
})
