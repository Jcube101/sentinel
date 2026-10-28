import { useMemo } from 'react'
import { sinceYesterday, type Movement } from '@/lib/desk/changes'
import { copyContext } from '@/lib/desk/copy'
import { deskEntries } from '@/lib/desk/entries'
import { useChangeWindow, useEdition, useLatestEditionId } from './useEdition'

/**
 * An edition ready to print: its data, the comparison with a day earlier, the
 * ranked entries and the copy context. `id` null = the latest edition.
 */
export function useEditionDesk(id: number | null) {
  const latest = useLatestEditionId()
  const latestId = latest.data ?? null
  const edition = useEdition(id ?? latestId)
  const data = edition.data ?? null
  const run = data && data.run.status !== 'running' ? data.run : null
  const changeWindow = useChangeWindow(run)
  const since = useMemo(() => (data && changeWindow.data ? sinceYesterday(data.snapshots, changeWindow.data) : null), [data, changeWindow.data])
  const entries = useMemo(() => {
    if (!data) return []
    const moves = since?.byItem ?? (changeWindow.isError ? new Map<string, Movement>() : undefined)
    return deskEntries(data.snapshots, moves)
  }, [data, since, changeWindow.isError])
  const ctx = useMemo(() => (data ? copyContext(entries, since, data.run) : null), [data, entries, since])
  const pending = latest.isPending || edition.isPending || (run !== null && changeWindow.isPending && !changeWindow.isError)
  return { latestId, data, since, entries, ctx, pending, error: latest.error ?? edition.error ?? null }
}
