import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CategoryStatus, Edition, EditionData, Snapshot } from '@/lib/desk/types'

// Selects shared with the test fixtures (src/lib/desk/__fixtures__).
export const RUN_SELECT = 'id,started_at,finished_at,status,duration_s,sources'
export const SNAPSHOT_SELECT =
  'run_id,item_id,taken_at,category,status,severity_level,severity_reason,last_known,new_data,change,figures,' +
  'desk_items(title,place_name,latitude,longitude,source,source_ref)'

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
      return {
        run: run.data as unknown as Edition,
        snapshots: (snapshots.data ?? []) as unknown as Snapshot[],
        status: (status.data ?? []) as unknown as CategoryStatus[],
      }
    },
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.data?.run.status === 'running' ? 60_000 : false),
    enabled: !!supabase && id !== null,
  })
}
