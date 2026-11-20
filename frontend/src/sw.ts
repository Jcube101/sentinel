/// <reference lib="webworker" />
// The service worker (vite-plugin-pwa, injectManifest): the app shell is
// precached, edition data goes to the network first, and a response that had
// to come from the cache says so, so the page never shows it as current.

import { clientsClaim } from 'workbox-core'
import type { WorkboxPlugin } from 'workbox-core/types'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CACHE_HEADER, type CacheReason } from './lib/offline'

declare let self: ServiceWorkerGlobalScope

// A new version takes over as soon as it has installed; the page then reloads
// itself (registerSW in main.tsx), so a deploy shows on the first open.
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// Every address is the one page: a deep link (/edition/83, /item/…) opened
// offline gets the precached shell, and the router takes it from there. The
// one exception is the link-preview image, which isn't precached: opened in a
// tab, it goes to the network and shows the image, not the app.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/og-image\.png$/] }))

/** How long the network gets before a saved copy is shown instead. */
const NETWORK_TIMEOUT_S = 4

/**
 * Marks a response served from the cache with why the network lost: the fetch
 * failed, Supabase answered 5xx, or (neither) the timeout ran out. A response
 * built here keeps its headers readable to the page although the request is
 * cross-origin; the page reads the mark in lib/supabase.ts.
 */
const markCached: WorkboxPlugin = {
  // NetworkFirst hands any response on, a 503 included. A 5xx counts as a
  // failure so the saved copy is used; a 4xx is the page's own answer.
  fetchDidSucceed: async ({ response, state }) => {
    if (response.status >= 500) {
      if (state) state.reason = 'error' satisfies CacheReason
      throw new Error(`Supabase answered ${response.status}`)
    }
    return response
  },
  fetchDidFail: async ({ state }) => {
    if (state && !state.reason) state.reason = 'failed' satisfies CacheReason
  },
  cachedResponseWillBeUsed: async ({ cachedResponse, state }) => {
    if (!cachedResponse) return cachedResponse
    const headers = new Headers(cachedResponse.headers)
    headers.set(CACHE_HEADER, (state?.reason as CacheReason | undefined) ?? 'timeout')
    return new Response(cachedResponse.body, { status: cachedResponse.status, statusText: cachedResponse.statusText, headers })
  },
}

// Edition data: every read is a GET to Supabase's REST API (PostgREST), on
// exactly this project's origin. Network first, never stale-while-revalidate:
// a normal open always shows the latest edition.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
if (supabaseUrl) {
  const origin = new URL(supabaseUrl).origin
  registerRoute(
    ({ url, request }) => request.method === 'GET' && url.origin === origin && url.pathname.startsWith('/rest/v1/'),
    new NetworkFirst({
      cacheName: 'supabase-rest',
      networkTimeoutSeconds: NETWORK_TIMEOUT_S,
      matchOptions: { ignoreVary: true },
      plugins: [markCached, new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 86_400, purgeOnQuotaError: true })],
    }),
  )
}

// The typefaces (Google Fonts): the stylesheet may be a little old, the font
// files never change. Map tiles are left to the network (see the README).
registerRoute(({ url }) => url.origin === 'https://fonts.googleapis.com', new StaleWhileRevalidate({ cacheName: 'font-styles' }))
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({ cacheName: 'font-files', plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 365 * 86_400 })] }),
)
