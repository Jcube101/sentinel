// Rows the desk reads from Supabase (schema: pipeline/migrations/001, 002, 005).

export type Category = 'earthquake' | 'flood' | 'cyclone' | 'fire' | 'air'
export type Level = 1 | 2 | 3 | 4
export type Change = 'opened' | 'reopened' | 'escalated' | 'deescalated' | 'closed'

/** One source's result in one run: pipeline_runs.sources[<sources.id>]. */
export interface RunSourceResult {
  status: string // ok | empty | timeout | error
  rows?: number | null
  error?: string | null
  duration_s?: number | null
  newest_observation_at?: string | null
  new_data?: boolean | null
}

/** A pipeline_runs row. Its id is the edition number. */
export interface Edition {
  id: number
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'failed'
  duration_s: number | null
  sources: Record<string, RunSourceResult | undefined>
}

/** Key figures stored with each item. Which keys exist depends on the category. */
export interface Figures {
  [key: string]: unknown
  // earthquake
  magnitude?: number
  // fire
  state?: string
  district_count?: number
  ratio_to_norm?: number | null
  capped?: boolean
  firms_level?: number
  calibration_cap?: number
  gdacs_wildfire?: unknown[]
  // air
  source?: 'datagov' | 'openaq'
  approximate?: boolean
  unvalidated?: boolean
  cities?: AirCity[]
  severe_unconfirmed?: string[]
  data_as_of?: string | null
}

export type AirBand = 'poor' | 'very_poor' | 'severe'

export interface AirCity {
  city: string
  band: AirBand
  counted_as?: AirBand
  aqi?: number
  state?: string
}

/** The desk_items fields embedded in a snapshot (current values, not as of the run). */
export interface SnapshotItem {
  title: string
  place_name: string | null
  latitude: number | null
  longitude: number | null
  source: string
  source_ref: string | null
}

/** A desk_item_snapshots row: one item as it stood in one edition. */
export interface Snapshot {
  run_id: number
  item_id: string
  taken_at: string
  category: Category
  status: 'open' | 'closed'
  severity_level: Level
  severity_reason: string
  last_known: boolean
  new_data: boolean
  change: Change | null
  figures: Figures
  desk_items: SnapshotItem | null
}

/** A category_status row: one category in one edition. */
export interface CategoryStatus {
  run_id: number
  category: Category
  level: Level | null
  open_items: number
  last_known: boolean
  summary: string
  source: string
  source_status: string | null
  watching: number
  taken_at: string
}

/** Everything step 1 of the desk needs for one edition. */
export interface EditionData {
  run: Edition
  snapshots: Snapshot[]
  status: CategoryStatus[]
}
