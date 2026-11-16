import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { watchConnection } from './lib/offline'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Two retries, but none while the browser is sure it is offline.
      retry: (failures) => navigator.onLine && failures < 2,
      refetchOnWindowFocus: false,
      // Always run the query, offline too: the service worker answers from its
      // cache, and a page with no saved copy reaches its error state. (The
      // default pauses queries while the browser reports offline.)
      networkMode: 'always',
    },
  },
})

// Saved data is never shown as current: the banner (OfflineBanner) stays up
// until a check finds every response coming from the network again.
watchConnection(() => queryClient.invalidateQueries())

if ('serviceWorker' in navigator) {
  // The first visit's reads happen before the service worker controls the
  // page, so they aren't in its cache: read them again once it takes control.
  // (On an update the page reloads instead; see registerSW below.)
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => void queryClient.invalidateQueries(), { once: true })
  }
  // autoUpdate: a new version installs, takes over and reloads the page, so a
  // deploy shows on the first open. An installed app brought back to the front
  // doesn't navigate, so it checks for a new version then.
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration.update()
      })
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
