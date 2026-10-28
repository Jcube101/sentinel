import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { WINDOW_HOURS } from '@/lib/desk/changes'
import { missingCategories } from '@/lib/desk/entries'
import type { Category, CategoryStatus, ChangeWindow, Edition, EditionData, Snapshot, SnapshotTrace } from '@/lib/desk/types'

// Selects shared with the test fixtures (src/lib/desk/__fixtures__).
export const RUN_SELECT = 'id,started_at,finished_at,status,duration_s,sources'
export const SNAPSHOT_SELECT =
  'run_id,item_id,taken_at,category,status,severity_level,severity_reason,last_known,new_data,change,figures,' +
  'desk_items(title,place_name,latitude,longitude,source,source_ref)'
export const TRACE_SELECT = 'run_id,item_id,category,status,severity_level,change'

/** The newest finished edition's number (a run still writing is skipped). */
export function useLatestEditionId() {
  return useQuery({
    queryKey: ['latest-edition'],
    queryFn: async (): Promise<number | null> => {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('id')
        .neq('status', 'running')
        .order('id', { ascending: false })
        .limit(1)
      if (error) throw error
      return data?.[0]?.id ?? null
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    enabled: !!supabase,
  })
}

/**
 * The open items of a category as of its latest earlier snapshots, marked
 * carried_from: the edition shows them as last-known rather than leaving
 * them off. Never happened so far (checked on editions 1-25).
 */
async function carriedSnapshots(id: number, category: Category, have: Set<string>): Promise<Snapshot[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('desk_item_snapshots')
    .select(SNAPSHOT_SELECT)
    .eq('category', category)
    .lt('run_id', id)
    .order('run_id', { ascending: false })
    .limit(100)
  if (error) throw error
  const rows = (data ?? []) as unknown as Snapshot[]
  const last = rows[0]?.run_id
  return rows
    .filter((s) => s.run_id === last && s.status === 'open' && !have.has(s.item_id))
    .map((s) => ({ ...s, carried_from: s.run_id }))
}

/**
 * One edition as published: its run, its snapshots (with the item's stable
 * fields embedded) and its per-category status. null = no such edition.
 *
 * A finished edition never changes, so it is cached for good; one still
 * being written is polled until it finishes.
 */
export function useEdition(id: number | null) {
  return useQuery({
    queryKey: ['edition', id],
    queryFn: async (): Promise<EditionData | null> => {
      if (!supabase || id === null) return null
      const [run, snapshots, status] = await Promise.all([
        supabase.from('pipeline_runs').select(RUN_SELECT).eq('id', id).maybeSingle(),
        supabase.from('desk_item_snapshots').select(SNAPSHOT_SELECT).eq('run_id', id).order('item_id'),
        supabase.from('category_status').select('*').eq('run_id', id).order('category'),
      ])
      if (run.error) throw run.error
      if (snapshots.error) throw snapshots.error
      if (status.error) throw status.error
      if (!run.data) return null
      const snaps = (snapshots.data ?? []) as unknown as Snapshot[]
      const stat = (status.data ?? []) as unknown as CategoryStatus[]
      const have = new Set(snaps.map((s) => s.item_id))
      const carried = await Promise.all(missingCategories(snaps, stat).map((c) => carriedSnapshots(id, c, have)))
      return { run: run.data as unknown as Edition, snapshots: [...snaps, ...carried.flat()], status: stat }
    },
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.data?.run.status === 'running' ? 60_000 : false),
    enabled: !!supabase && id !== null,
  })
}

/**
 * What "since yesterday" compares the edition with: the edition about a day
 * earlier (WINDOW_HOURS before it started) and the snapshots in between.
 * Fixed once the edition has finished, so cached for good.
 */
export function useChangeWindow(run: Edition | null) {
  return useQuery({
    queryKey: ['change-window', run?.id],
    queryFn: async (): Promise<ChangeWindow> => {
      if (!supabase || !run) return { ref: null, rows: [], closed: [] }
      const cutoff = new Date(Date.parse(run.started_at) - WINDOW_HOURS * 3600_000).toISOString()
      const ref = await supabase
        .from('pipeline_runs')
        .select('id,started_at')
        .neq('status', 'running')
        .lte('started_at', cutoff)
        .order('id', { ascending: false })
        .limit(1)
      if (ref.error) throw ref.error
      const r = (ref.data?.[0] ?? null) as ChangeWindow['ref']
      const lo = r?.id ?? 0
      const [rows, closed] = await Promise.all([
        supabase
          .from('desk_item_snapshots')
          .select(TRACE_SELECT)
          .gte('run_id', Math.max(lo, 1))
          .lt('run_id', run.id)
          .order('run_id')
          .order('item_id'),
        supabase
          .from('desk_item_snapshots')
          .select(SNAPSHOT_SELECT)
          .eq('change', 'closed')
          .gt('run_id', lo)
          .lt('run_id', run.id)
          .order('run_id')
          .order('item_id'),
      ])
      if (rows.error) throw rows.error
      if (closed.error) throw closed.error
      return {
        ref: r,
        rows: (rows.data ?? []) as unknown as SnapshotTrace[],
        closed: (closed.data ?? []) as unknown as Snapshot[],
      }
    },
    staleTime: Infinity,
    enabled: !!supabase && run !== null && run.status !== 'running',
  })
}
