import { useSyncExternalStore } from 'react'
import { getConnection, subscribe, type Connection } from '@/lib/offline'

/** Whether the page is showing saved data, and why (lib/offline.ts); null = live data. */
export function useConnection(): Connection | null {
  return useSyncExternalStore(subscribe, getConnection, () => null)
}
