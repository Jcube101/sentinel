import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { WINDOW_HOURS } from '@/lib/desk/changes'
import { STRIP_DAYS } from '@/lib/desk/quiet'
import { chooseDayEdition, dayStart, runsByDay, shiftMonth } from '@/lib/desk/archive'
import type { FirePoint } from '@/components/paper/PaperMap'
import { missingCategories } from '@/lib/desk/entries'
import type {
  Category,
  CategoryStatus,
  ChangeWindow,
  DeskHistory,
  Edition,
  EditionData,
  RunRef,
  Snapshot,
  SnapshotTrace,
  TimedSnapshot,
  TimedTrace,
  WatchRow,
} from '@/lib/desk/types'

// Selects shared with the test fixtures (src/lib/desk/__fixtures__).
export const RUN_SELECT = 'id,started_at,finished_at,status,duration_s,sources'
export const SNAPSHOT_SELECT =
  'run_id,item_id,taken_at,category,status,severity_level,severity_reason,last_known,new_data,change,figures,' +
  'desk_items(title,place_name,latitude,longitude,source,source_ref,last_run_id)'
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

const TIMED_SNAPSHOT_SELECT = `${SNAPSHOT_SELECT},pipeline_runs(started_at)`
const TIMED_TRACE_SELECT = `${TRACE_SELECT},pipeline_runs(started_at)`

/**
 * The quiet desk's history up to an edition: runs and levels over 14 days
 * (the strip), the latest Level 3+ snapshot, and the last few closed items
 * with their history. Only data up to the edition, so cached for good.
 */
export function useDeskHistory(run: Edition | null, enabled: boolean) {
  return useQuery({
    queryKey: ['desk-history', run?.id],
    queryFn: async (): Promise<DeskHistory> => {
      if (!supabase || !run) return { runs: [], strip: [], lastLevel3: null, closed: [], closedHistory: [] }
      const from = new Date(Date.parse(run.started_at) - STRIP_DAYS * 86_400_000).toISOString()
      const [runs, last3, closed] = await Promise.all([
        supabase.from('pipeline_runs').select('id,started_at,status').gte('started_at', from).lte('id', run.id).order('id'),
        supabase
          .from('desk_item_snapshots')
          .select(TIMED_SNAPSHOT_SELECT)
          .gte('severity_level', 3)
          .lte('run_id', run.id)
          .order('run_id', { ascending: false })
          .limit(1),
        supabase
          .from('desk_item_snapshots')
          .select(TIMED_SNAPSHOT_SELECT)
          .eq('change', 'closed')
          .lte('run_id', run.id)
          .order('run_id', { ascending: false })
          .limit(5),
      ])
      if (runs.error) throw runs.error
      if (last3.error) throw last3.error
      if (closed.error) throw closed.error
      const runRows = (runs.data ?? []) as RunRef[]
      const closedRows = (closed.data ?? []) as unknown as TimedSnapshot[]
      const [strip, history] = await Promise.all([
        runRows.length === 0
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from('desk_item_snapshots')
              .select('run_id,severity_level')
              .eq('status', 'open')
              .gte('run_id', runRows[0].id)
              .lte('run_id', run.id),
        closedRows.length === 0
          ? Promise.resolve({ data: [], error: null })
          : supabase
              .from('desk_item_snapshots')
              .select(TIMED_TRACE_SELECT)
              .in(
                'item_id',
                closedRows.map((c) => c.item_id),
              )
              .lte('run_id', run.id)
              .order('run_id'),
      ])
      if (strip.error) throw strip.error
      if (history.error) throw history.error
      return {
        runs: runRows,
        strip: (strip.data ?? []) as DeskHistory['strip'],
        lastLevel3: ((last3.data ?? [])[0] ?? null) as unknown as TimedSnapshot | null,
        closed: closedRows,
        closedHistory: (history.data ?? []) as unknown as TimedTrace[],
      }
    },
    staleTime: Infinity,
    enabled: !!supabase && run !== null && run.status !== 'running' && enabled,
  })
}

/** The watching list: desk_watch rows marked watching. Current state only, so the latest edition only (until P2). */
export function useWatching(enabled: boolean) {
  return useQuery({
    queryKey: ['watching'],
    queryFn: async (): Promise<WatchRow[]> => {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('desk_watch')
        .select('id,category,title,item_id,level,next_level,metric,value,next_threshold,distance_to_threshold,trend,rising_updates,watching,watch_reason,last_run_id')
        .eq('watching', true)
        .order('distance_to_threshold')
      if (error) throw error
      return (data ?? []) as unknown as WatchRow[]
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase && enabled,
  })
}

/** A desk_items row: the item's current state (title, status, times). */
export interface ItemRow {
  id: string
  category: Category
  title: string
  place_name: string | null
  source: string
  source_ref: string | null
  status: 'open' | 'closed'
  severity_level: number
  peak_level: number
  opened_at: string
  closed_at: string | null
  observed_at: string | null
  last_run_id: number | null
}

/**
 * One item: its desk_items row and its snapshots, up to an edition when one
 * is given (the archive's view of it), else all of them.
 */
export function useItem(id: string, edition: number | null) {
  return useQuery({
    queryKey: ['item', id, edition],
    queryFn: async (): Promise<{ item: ItemRow | null; snapshots: TimedSnapshot[] }> => {
      if (!supabase) return { item: null, snapshots: [] }
      let snaps = supabase.from('desk_item_snapshots').select(TIMED_SNAPSHOT_SELECT).eq('item_id', id)
      if (edition !== null) snaps = snaps.lte('run_id', edition)
      const [item, rows] = await Promise.all([
        supabase
          .from('desk_items')
          .select('id,category,title,place_name,source,source_ref,status,severity_level,peak_level,opened_at,closed_at,observed_at,last_run_id')
          .eq('id', id)
          .maybeSingle(),
        snaps.order('run_id'),
      ])
      if (item.error) throw item.error
      if (rows.error) throw rows.error
      return { item: (item.data ?? null) as ItemRow | null, snapshots: (rows.data ?? []) as unknown as TimedSnapshot[] }
    },
    staleTime: edition !== null ? Infinity : 5 * 60_000,
    enabled: !!supabase,
  })
}

/** A state's fires per UTC day, kept for 14 days (fire_state_daily). */
export function useFireDaily(state: string | null) {
  return useQuery({
    queryKey: ['fire-daily', state],
    queryFn: async (): Promise<{ acq_date: string; fire_events: number; districts: number; hotspots: number }[]> => {
      if (!supabase || !state) return []
      const { data, error } = await supabase
        .from('fire_state_daily')
        .select('acq_date,fire_events,districts,hotspots')
        .eq('state', state)
        .order('acq_date')
      if (error) throw error
      return (data ?? []) as { acq_date: string; fire_events: number; districts: number; hotspots: number }[]
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase && !!state,
  })
}

/**
 * Fire events for one UTC day (fire_events keeps 14 days, and rebuilds today
 * and yesterday each run): the map's fire layer.
 */
export function useFirePoints(day: string | null) {
  return useQuery({
    queryKey: ['fire-points', day],
    queryFn: async (): Promise<FirePoint[]> => {
      if (!supabase || !day) return []
      const { data, error } = await supabase
        .from('fire_events')
        .select('id,latitude,longitude,hotspot_count,frp_max,district,state')
        .eq('acq_date', day)
        .not('state', 'is', null) // India only: the same fires the counts are made of
        .limit(5000)
      if (error) throw error
      return (data ?? []) as FirePoint[]
    },
    staleTime: 10 * 60_000,
    enabled: !!supabase && !!day,
  })
}

/** The 21 editions up to this one, each with its highest open level (the map's edition strip). */
export function useEditionStrip(run: Edition | null) {
  return useQuery({
    queryKey: ['edition-strip', run?.id],
    queryFn: async (): Promise<{ id: number; started_at: string; level: number }[]> => {
      if (!supabase || !run) return []
      const runs = await supabase
        .from('pipeline_runs')
        .select('id,started_at')
        .lte('id', run.id)
        .neq('status', 'running')
        .order('id', { ascending: false })
        .limit(21)
      if (runs.error) throw runs.error
      const list = ((runs.data ?? []) as RunRef[]).reverse()
      if (list.length === 0) return []
      const snaps = await supabase
        .from('desk_item_snapshots')
        .select('run_id,severity_level')
        .eq('status', 'open')
        .gte('run_id', list[0].id)
        .lte('run_id', run.id)
      if (snaps.error) throw snaps.error
      const max = new Map<number, number>()
      for (const s of (snaps.data ?? []) as { run_id: number; severity_level: number }[]) {
        max.set(s.run_id, Math.max(max.get(s.run_id) ?? 0, s.severity_level))
      }
      return list.map((r) => ({ id: r.id, started_at: r.started_at, level: max.get(r.id) ?? 0 }))
    },
    staleTime: Infinity,
    enabled: !!supabase && run !== null && run.status !== 'running',
  })
}

/** Items closed in the 21 editions up to this one, with their closing snapshot (the map's "incl. closed"). */
export function useRecentClosed(run: Edition | null, enabled: boolean) {
  return useQuery({
    queryKey: ['recent-closed', run?.id],
    queryFn: async (): Promise<Snapshot[]> => {
      if (!supabase || !run) return []
      const { data, error } = await supabase
        .from('desk_item_snapshots')
        .select(SNAPSHOT_SELECT)
        .eq('change', 'closed')
        .gt('run_id', run.id - 21)
        .lte('run_id', run.id)
        .order('run_id', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Snapshot[]
    },
    staleTime: Infinity,
    enabled: !!supabase && run !== null && enabled,
  })
}

/** The 21 runs up to an edition with their per-source results (the Sources page grid). */
export function useRunSources(run: Edition | null) {
  return useQuery({
    queryKey: ['run-sources', run?.id],
    queryFn: async (): Promise<Edition[]> => {
      if (!supabase || !run) return []
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select(RUN_SELECT)
        .lte('id', run.id)
        .neq('status', 'running')
        .order('id', { ascending: false })
        .limit(21)
      if (error) throw error
      return ((data ?? []) as unknown as Edition[]).reverse()
    },
    staleTime: Infinity,
    enabled: !!supabase && run !== null && run.status !== 'running',
  })
}

/** The first and the latest finished editions: the archive's span. */
export function useArchiveSpan() {
  return useQuery({
    queryKey: ['archive-span'],
    queryFn: async (): Promise<{ first: RunRef | null; latest: RunRef | null }> => {
      if (!supabase) return { first: null, latest: null }
      const [first, latest] = await Promise.all([
        supabase.from('pipeline_runs').select('id,started_at,status').neq('status', 'running').order('id').limit(1),
        supabase.from('pipeline_runs').select('id,started_at,status').neq('status', 'running').order('id', { ascending: false }).limit(1),
      ])
      if (first.error) throw first.error
      if (latest.error) throw latest.error
      return { first: (first.data?.[0] ?? null) as RunRef | null, latest: (latest.data?.[0] ?? null) as RunRef | null }
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase,
  })
}

export interface ArchiveMonth {
  /** The month's runs, plus two days before it (for "since yesterday"). */
  runs: RunRef[]
  /** Slim snapshots of those runs. */
  traces: SnapshotTrace[]
  /** Open snapshots of each day's chosen edition. */
  open: Snapshot[]
}

/** One month of the archive in three reads: runs, slim snapshots, and the chosen editions' open snapshots. */
export function useArchiveMonth(month: string | null) {
  return useQuery({
    queryKey: ['archive-month', month],
    queryFn: async (): Promise<ArchiveMonth> => {
      if (!supabase || !month) return { runs: [], traces: [], open: [] }
      const start = dayStart(`${month}-01`)
      const end = dayStart(`${shiftMonth(month, 1)}-01`)
      const before = new Date(Date.parse(start) - 2 * 86_400_000).toISOString()
      const runs = await supabase
        .from('pipeline_runs')
        .select('id,started_at,status')
        .neq('status', 'running')
        .gte('started_at', before)
        .lt('started_at', end)
        .order('id')
      if (runs.error) throw runs.error
      const list = (runs.data ?? []) as RunRef[]
      if (list.length === 0) return { runs: [], traces: [], open: [] }
      const inMonth = list.filter((r) => Date.parse(r.started_at) >= Date.parse(start))
      const chosen = [...runsByDay(inMonth).values()].map((d) => chooseDayEdition(d)!.run.id)
      const [traces, open] = await Promise.all([
        supabase
          .from('desk_item_snapshots')
          .select(TRACE_SELECT)
          .gte('run_id', list[0].id)
          .lte('run_id', list[list.length - 1].id)
          .order('run_id'),
        chosen.length === 0
          ? Promise.resolve({ data: [], error: null })
          : supabase.from('desk_item_snapshots').select(SNAPSHOT_SELECT).in('run_id', chosen).eq('status', 'open'),
      ])
      if (traces.error) throw traces.error
      if (open.error) throw open.error
      return { runs: list, traces: (traces.data ?? []) as unknown as SnapshotTrace[], open: (open.data ?? []) as unknown as Snapshot[] }
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase && !!month,
  })
}

/** A day's runs, and the nearest editions before and after it (for "no edition" and day-to-day links). */
export function useDayRuns(day: string | null) {
  return useQuery({
    queryKey: ['day-runs', day],
    queryFn: async (): Promise<{ runs: RunRef[]; prev: RunRef | null; next: RunRef | null }> => {
      if (!supabase || !day) return { runs: [], prev: null, next: null }
      const start = dayStart(day)
      const end = new Date(Date.parse(start) + 86_400_000).toISOString()
      const [runs, prev, next] = await Promise.all([
        supabase.from('pipeline_runs').select('id,started_at,status').neq('status', 'running').gte('started_at', start).lt('started_at', end).order('id'),
        supabase.from('pipeline_runs').select('id,started_at,status').neq('status', 'running').lt('started_at', start).order('id', { ascending: false }).limit(1),
        supabase.from('pipeline_runs').select('id,started_at,status').neq('status', 'running').gte('started_at', end).order('id').limit(1),
      ])
      for (const r of [runs, prev, next]) if (r.error) throw r.error
      return {
        runs: (runs.data ?? []) as RunRef[],
        prev: (prev.data?.[0] ?? null) as RunRef | null,
        next: (next.data?.[0] ?? null) as RunRef | null,
      }
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase && !!day,
  })
}

/**
 * Closings in a month, from the closing snapshots (an item that reopened
 * later still shows its closing), with the history to find its peak and how
 * long it was open (quiet.closedSummaries).
 */
export function useClosedInMonth(month: string | null) {
  return useQuery({
    queryKey: ['closed-month', month],
    queryFn: async (): Promise<Pick<DeskHistory, 'closed' | 'closedHistory'>> => {
      if (!supabase || !month) return { closed: [], closedHistory: [] }
      const runs = await supabase
        .from('pipeline_runs')
        .select('id')
        .gte('started_at', dayStart(`${month}-01`))
        .lt('started_at', dayStart(`${shiftMonth(month, 1)}-01`))
        .order('id')
      if (runs.error) throw runs.error
      const ids = ((runs.data ?? []) as { id: number }[]).map((r) => r.id)
      if (ids.length === 0) return { closed: [], closedHistory: [] }
      const closed = await supabase
        .from('desk_item_snapshots')
        .select(TIMED_SNAPSHOT_SELECT)
        .eq('change', 'closed')
        .gte('run_id', ids[0])
        .lte('run_id', ids[ids.length - 1])
        .order('run_id', { ascending: false })
      if (closed.error) throw closed.error
      const rows = (closed.data ?? []) as unknown as TimedSnapshot[]
      if (rows.length === 0) return { closed: [], closedHistory: [] }
      const history = await supabase
        .from('desk_item_snapshots')
        .select(TIMED_TRACE_SELECT)
        .in('item_id', [...new Set(rows.map((r) => r.item_id))])
        .lte('run_id', ids[ids.length - 1])
        .order('run_id')
      if (history.error) throw history.error
      return { closed: rows, closedHistory: (history.data ?? []) as unknown as TimedTrace[] }
    },
    staleTime: 5 * 60_000,
    enabled: !!supabase && !!month,
  })
}

/**
 * The desk item an old site's event became, for `/event/:id` links: desk
 * items keep the event's id as `source_ref`. null when it never reached the
 * desk (fires are per state now; NASA's event tracker isn't levelled).
 */
export function useItemForEvent(eventId: string | null) {
  return useQuery({
    queryKey: ['item-for-event', eventId],
    queryFn: async (): Promise<string | null> => {
      if (!supabase || !eventId) return null
      const { data, error } = await supabase.from('desk_items').select('id').eq('source_ref', eventId).limit(1)
      if (error) throw error
      return (data?.[0]?.id as string | undefined) ?? null
    },
    staleTime: Infinity,
    enabled: !!supabase && !!eventId,
  })
}
