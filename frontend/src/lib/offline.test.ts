import { beforeEach, describe, expect, it } from 'vitest'
import { bannerText, checkAgain, connectionFrom, getConnection, loadError, NOT_SAVED, noteResponse, resetConnection, watchConnection, worse } from './offline'

const SHOWN = { id: 83, when: 'Tue 17 Nov 2026, 14:30 IST' }

describe('connectionFrom', () => {
  it("says offline only when the fetch failed and the browser is sure it's offline", () => {
    expect(connectionFrom('failed', false)).toBe('offline')
    expect(connectionFrom('failed', true)).toBe('unreachable')
  })
  it('never says offline for a slow connection', () => {
    expect(connectionFrom('timeout', true)).toBe('slow')
    expect(connectionFrom('timeout', false)).toBe('slow')
  })
  it('a 5xx is the data not answering', () => {
    expect(connectionFrom('error', true)).toBe('unreachable')
  })
})

describe('bannerText', () => {
  it('offline', () => {
    expect(bannerText('offline', SHOWN)).toBe("You're offline. Showing No. 83, Tue 17 Nov 2026, 14:30 IST. There may be a newer edition.")
  })
  it('slow', () => {
    expect(bannerText('slow', SHOWN)).toBe('The connection is slow. Showing the saved copy of No. 83, Tue 17 Nov 2026, 14:30 IST. There may be a newer edition.')
  })
  it('unreachable', () => {
    expect(bannerText('unreachable', SHOWN)).toBe("Sentinel's data didn't answer. Showing the saved copy of No. 83, Tue 17 Nov 2026, 14:30 IST. There may be a newer edition.")
  })
  it('a page with no edition of its own', () => {
    expect(bannerText('offline', null)).toBe("You're offline. Saved pages may be out of date.")
    expect(bannerText('slow', null)).toBe('The connection is slow. Saved pages may be out of date.')
  })
})

describe('loadError', () => {
  it('keeps the page’s line online, and says the page is not saved offline', () => {
    expect(loadError("Couldn't load the archive.", true)).toBe("Couldn't load the archive.")
    expect(loadError("Couldn't load the archive.", false)).toBe(NOT_SAVED)
  })
})

describe('the state', () => {
  beforeEach(() => resetConnection())

  it('a response from the network leaves it clear', () => {
    noteResponse(null, true)
    expect(getConnection()).toBeNull()
  })

  it('a cached response sets it, and a later network response alone does not clear it', () => {
    noteResponse('timeout', true)
    expect(getConnection()).toBe('slow')
    noteResponse(null, true)
    expect(getConnection()).toBe('slow')
  })

  it('keeps the more serious case', () => {
    noteResponse('timeout', true)
    noteResponse('failed', false)
    noteResponse('timeout', true)
    expect(getConnection()).toBe('offline')
    expect(worse('slow', 'unreachable')).toBe('unreachable')
  })

  it('a check clears it when everything came from the network', async () => {
    noteResponse('failed', false)
    watchConnectionWith(async () => noteResponse(null, true))
    await checkAgain()
    expect(getConnection()).toBeNull()
  })

  it('a check keeps it when a response still came from the cache, at the new case', async () => {
    noteResponse('failed', false)
    watchConnectionWith(async () => {
      noteResponse(null, true)
      noteResponse('timeout', true)
    })
    await checkAgain()
    expect(getConnection()).toBe('slow')
  })

  it('a check that reached nothing leaves it as it was', async () => {
    noteResponse('timeout', true)
    watchConnectionWith(async () => {})
    await checkAgain()
    expect(getConnection()).toBe('slow')
  })
})

/** watchConnection without a browser: only the refetch matters here. */
function watchConnectionWith(refetch: () => Promise<unknown>) {
  const g = globalThis as Record<string, unknown>
  g.window ??= { addEventListener: () => {}, setInterval: () => 0 }
  g.document ??= { addEventListener: () => {}, visibilityState: 'visible' }
  watchConnection(refetch)
}
