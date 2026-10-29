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
  /** severity.toml as the edition ran it (plan P3; editions 1-28 backfilled). Read with scaleFrom(). */
  severity_config?: unknown
}

/** Key figures stored with each item. Which keys exist depends on the category. */
export interface Figures {
  [key: string]: unknown
  // earthquake (desk.usgs_candidates)
  magnitude?: number
  magnitude_type?: string | null
  depth_km?: number | null
  km_from_india?: number | null
  in_india?: boolean
  tsunami?: boolean
  felt_reports?: number | null
  usgs_alert?: string | null
  // flood and cyclone (desk.gdacs_candidates)
  alert_level?: string | null
  alert_score?: number | null
  prev_episode_alert_score?: number | null
  rising?: boolean
  severity?: number | null
  severity_unit?: string | null
  severity_text?: string | null
  episode_id?: number | null
  episode_alert_level?: string | null
  gdacs_url?: string | null
  // fire (fire_desk.state_candidate)
  state?: string
  day?: string
  fire_events?: number
  hotspots?: number
  district_count?: number
  districts?: FireDistrict[]
  ratio_to_norm?: number | null
  norm_daily_events?: number | null
  norm_max_daily_events?: number | null
  norm_years?: string
  ratio_level?: number
  gdacs_level?: number | null
  /** A Level 4 state's large fires near towns; with latitude and longitude from edition 29. */
  large_fires_near_people?: unknown[]
  capped?: boolean
  firms_level?: number
  calibration_cap?: number
  min_fire_events?: number
  /** The newest FIRMS observation the fire stage had: the fire map keeps points first seen by then. */
  data_to?: string
  gdacs_wildfire?: unknown[]
  // air (air.py)
  source?: 'datagov' | 'openaq'
  approximate?: boolean
  unvalidated?: boolean
  cities?: AirCity[]
  counts?: Partial<Record<AirBand, number>>
  cities_reporting?: number
  severe_unconfirmed?: string[]
  data_as_of?: string | null
}

export interface FireDistrict {
  district: string
  fire_events: number
  hotspots?: number
  frp_max?: number
}

export type AirBand = 'poor' | 'very_poor' | 'severe'

export interface AirCity {
  city: string
  band: AirBand
  counted_as?: AirBand
  /** CPCB AQI (data.gov.in). The OpenAQ fallback has 24 h means instead. */
  aqi?: number
  pm25_24h?: number | null
  pm10_24h?: number | null
  state?: string
  prominent?: string[]
}

/** The desk_items fields embedded in a snapshot (current values, not as of the run). Editions from 29 on carry their own (Snapshot.title etc., plan P1). */
export interface SnapshotItem {
  title: string
  place_name: string | null
  latitude: number | null
  longitude: number | null
  source: string
  source_ref: string | null
  /** The last run that wrote the item: its place and lat/lon are as of that run. */
  last_run_id?: number | null
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
  /**
   * The item's title, place and position as of this run (plan P1). From
   * edition 29 on; null (or absent, in older fixtures) before it, where
   * desk_items stands in.
   */
  title?: string | null
  place_name?: string | null
  latitude?: number | null
  longitude?: number | null
  desk_items: SnapshotItem | null
  /**
   * Set by the site, not stored: the item's stage failed in this run, so this
   * is its latest snapshot from an earlier edition (that edition's number).
   */
  carried_from?: number
}

/** A slim snapshot row: enough to follow an item's level from run to run. */
export interface SnapshotTrace {
  run_id: number
  item_id: string
  category: Category
  status: 'open' | 'closed'
  severity_level: Level
  change: Change | null
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

/** One edition: its run, its snapshots and its per-category status. */
export interface EditionData {
  run: Edition
  snapshots: Snapshot[]
  status: CategoryStatus[]
}

/** What "since yesterday" compares an edition with. */
export interface ChangeWindow {
  /** The edition about a day earlier; null when there is none (the first editions). */
  ref: Pick<Edition, 'id' | 'started_at'> | null
  /** Snapshots of runs from ref up to the edition, not including it (slim). */
  rows: SnapshotTrace[]
  /** Full snapshots of items that closed after ref and before the edition. */
  closed: Snapshot[]
}

/** A pipeline_runs row, by number and start time. */
export interface RunRef {
  id: number
  started_at: string
  status?: string
}

/** A snapshot with its run's start time embedded (pipeline_runs(started_at)). */
export type TimedSnapshot = Snapshot & { pipeline_runs: { started_at: string } | null }
export type TimedTrace = SnapshotTrace & { pipeline_runs: { started_at: string } | null }

/** What the quiet desk reads from the editions up to this one. */
export interface DeskHistory {
  /** Runs in the 14 days up to the edition. */
  runs: RunRef[]
  /** Open snapshots of those runs: run and level only. */
  strip: { run_id: number; severity_level: Level }[]
  /** The latest snapshot at Level 3 or above, up to the edition. */
  lastLevel3: TimedSnapshot | null
  /** The last few closing snapshots up to the edition, newest first. */
  closed: TimedSnapshot[]
  /** Every snapshot of those closed items up to the edition. */
  closedHistory: TimedTrace[]
}

/** A desk_watch row: one subject's distance to its next level (current state only). */
export interface WatchRow {
  id: string
  category: Category
  title: string
  item_id: string | null
  level: Level
  next_level: Level | null
  metric: string
  value: number | null
  next_threshold: number | null
  distance_to_threshold: number | null
  trend: { at: string; value: number; threshold: number | null; next_level: number | null }[] | null
  rising_updates: number
  watching: boolean
  watch_reason: string | null
  last_run_id: number | null
}
