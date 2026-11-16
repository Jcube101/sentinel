// Whether the page is showing saved data. The service worker (src/sw.ts)
// marks a Supabase response it had to take from its cache; the Supabase client
// reports each response here, and the banner (OfflineBanner) reads the state.
// No imports: the service worker shares the header name and the reasons.

/** The header the service worker sets on a response served from its cache. */
export const CACHE_HEADER = 'X-Sentinel-Cache'

/** Why the network lost: the fetch failed, the 4 s timeout ran out, or Supabase answered 5xx. */
export type CacheReason = 'failed' | 'timeout' | 'error'

/** What the banner says: the device is offline, the connection is slow, or the data didn't answer. */
export type Connection = 'offline' | 'slow' | 'unreachable'

const RANK: Record<Connection, number> = { slow: 1, unreachable: 2, offline: 3 }

/**
 * The banner's case for one cached response. `navigator.onLine` is trusted
 * only when false: then the device is certainly offline. True proves nothing,
 * so a failed fetch while "online" is the data not answering, never "offline".
 */
export function connectionFrom(reason: string, online: boolean): Connection {
  if (reason === 'timeout') return 'slow'
  if (reason === 'failed' && !online) return 'offline'
  return 'unreachable'
}

/** The more serious of two cases (null = live data). */
export function worse(a: Connection | null, b: Connection | null): Connection | null {
  if (!a) return b
  if (!b) return a
  return RANK[a] >= RANK[b] ? a : b
}

/** The edition on the page, for the banner. */
export interface ShownEdition {
  id: number
  /** "Tue 17 Nov 2026, 14:30 IST" */
  when: string
}

/** The banner's words (docs/style-guide.md: facts said plainly). `shown` null = a page with no edition of its own. */
export function bannerText(connection: Connection, shown: ShownEdition | null): string {
  const lead = {
    offline: "You're offline.",
    slow: 'The connection is slow.',
    unreachable: "Sentinel's data didn't answer.",
  }[connection]
  // True whether or not this page has a saved copy (one that hasn't says so itself: NOT_SAVED).
  if (!shown) return `${lead} Saved pages may be out of date.`
  const copy = connection === 'offline' ? '' : 'the saved copy of '
  return `${lead} Showing ${copy}No. ${shown.id}, ${shown.when}. There may be a newer edition.`
}

/** In place of "Couldn't load…" when the device is offline and the page has no saved copy. */
export const NOT_SAVED = "You're offline, and this page isn't saved on this device."

/** NOT_SAVED when the device is certainly offline, else the page's own line. */
export function loadError(line: string, online: boolean = browserOnline()): string {
  return online ? line : NOT_SAVED
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

// The state: "since the last check, at least one response came from the cache".

let current: Connection | null = null
/** During a check: what its responses say so far, and whether any came from the network. */
let check: { found: Connection | null; live: boolean } | null = null
let refetchAll: (() => Promise<unknown>) | null = null
const listeners = new Set<() => void>()

function set(next: Connection | null) {
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getConnection(): Connection | null {
  return current
}

/** Called for every Supabase response with its cache mark (null = from the network). */
export function noteResponse(mark: string | null, online: boolean = browserOnline()) {
  const found = mark ? connectionFrom(mark, online) : null
  if (check) {
    check.found = worse(check.found, found)
    if (!found) check.live = true
  }
  // Outside a check the state only gets worse; only a check clears it.
  if (found) set(worse(current, found))
}

/**
 * Checks again: refetches every query and takes the state from what comes
 * back. The banner goes only when something answered from the network and
 * nothing came from the cache; it stays up while the check runs.
 */
export async function checkAgain(): Promise<void> {
  if (!refetchAll || check) return
  const mine = (check = { found: null, live: false })
  try {
    await refetchAll()
  } finally {
    check = null
    if (mine.found) set(mine.found)
    else if (mine.live) set(null)
  }
}

/** How often a page showing saved data checks again while it is open. */
const RECHECK_MS = 60_000

/**
 * Starts the checks (main.tsx): when the device comes back online, when the
 * app is brought back to the front, and every minute while the banner shows.
 * `refetch` refetches every query (React Query's invalidateQueries).
 */
export function watchConnection(refetch: () => Promise<unknown>) {
  refetchAll = refetch
  const recheck = () => {
    if (current && document.visibilityState === 'visible' && navigator.onLine) void checkAgain()
  }
  window.addEventListener('online', () => void checkAgain())
  document.addEventListener('visibilitychange', recheck)
  window.setInterval(recheck, RECHECK_MS)
}

/** For tests. */
export function resetConnection() {
  current = null
  check = null
}
