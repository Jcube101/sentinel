import { createClient } from '@supabase/supabase-js'
import { CACHE_HEADER, noteResponse } from './offline'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing — data features disabled')
}

/**
 * fetch, reporting whether each response came from the network or from the
 * service worker's cache (its X-Sentinel-Cache mark; src/sw.ts), so the page
 * can say when it is showing saved data.
 */
const reportingFetch: typeof fetch = async (input, init) => {
  let response: Response
  try {
    response = await fetch(input, init)
  } catch (error) {
    // Offline with no saved copy: fail at once. supabase-js retries a failed
    // read three times (1 s, 2 s, 4 s) unless the error is an abort, which
    // would keep the page on "Loading…" for seconds with no chance of an answer.
    if (!navigator.onLine) throw Object.assign(new Error('The device is offline.'), { name: 'AbortError' })
    throw error
  }
  noteResponse(response.headers.get(CACHE_HEADER))
  return response
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: reportingFetch } })
  : null
