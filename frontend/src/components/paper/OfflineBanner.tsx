import { useState } from 'react'
import { useConnection } from '@/hooks/useConnection'
import { bannerText, checkAgain, type ShownEdition } from '@/lib/offline'

/**
 * Says so when the page is showing saved data: the device is offline, the
 * connection is slow, or the data didn't answer (lib/offline.ts). Nothing when
 * the data came from the network.
 */
export default function OfflineBanner({ shown }: { shown: ShownEdition | null }) {
  const connection = useConnection()
  const [checking, setChecking] = useState(false)
  if (!connection) return null
  const again = () => {
    setChecking(true)
    void checkAgain().finally(() => setChecking(false))
  }
  return (
    <div role="status" className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-3.5 py-3 mt-3 bg-note border-l-4 border-accent text-[14px] sm:text-[15px] leading-[1.45]">
      <span>{bannerText(connection, shown)}</span>
      <button type="button" onClick={again} disabled={checking} className="font-mono text-[12px] uppercase border-b border-ink hover:text-accent disabled:text-ink-muted disabled:border-ink-muted">
        {checking ? 'Checking…' : 'Try again'}
      </button>
    </div>
  )
}
