// How each source fared in an edition: the footer line and the late notice.
// Built from pipeline_runs.sources of that run, never from the current
// sources table, so a past edition shows what was true when it ran.

import { CATEGORY_ORDER } from './entries'
import { shortAge } from './ist'
import type { Category, CategoryStatus, Edition, RunSourceResult } from './types'
import { SOURCE_WORDS, cap, listText } from './words'

export const SOURCE_ORDER = ['FIRMS', 'USGS', 'GDACS', 'EONET', 'OPENAQ', 'DATAGOV'] as const

export const SOURCE_NAMES: Record<string, string> = {
  FIRMS: 'FIRMS',
  USGS: 'USGS',
  GDACS: 'GDACS',
  EONET: 'EONET',
  OPENAQ: 'OpenAQ',
  DATAGOV: 'CPCB',
}

// Sources that report events as they happen: no new data is normal for them.
const EVENT_DRIVEN = new Set(['USGS', 'GDACS', 'EONET'])
const QUIET_AFTER_MS = 24 * 3600_000

const STATUS_WORDS: Record<string, string> = {
  timeout: 'timed out',
  error: 'failed',
  empty: 'came back empty',
}

/** Short names for the footer line: what each source covers, then its own name. */
export const FOOTER_NAMES: Record<string, string> = {
  FIRMS: 'Fire satellites (FIRMS)',
  USGS: 'Earthquakes (USGS)',
  GDACS: 'Disaster alerts (GDACS)',
  EONET: 'NASA events (EONET)',
  OPENAQ: 'Air monitors (OpenAQ)',
  DATAGOV: 'Air index (CPCB)',
}

/** What each source is, for readers (the phone wire's source list). */
export const SOURCE_TITLES: Record<string, string> = {
  FIRMS: 'NASA fire satellites (FIRMS)',
  USGS: 'US Geological Survey (USGS)',
  GDACS: 'Global disaster monitors (GDACS)',
  EONET: 'NASA natural-event tracker (EONET)',
  OPENAQ: 'Public air monitors (OpenAQ)',
  DATAGOV: 'Pollution control board live feed (CPCB)',
}

export interface SourceLine {
  id: string
  name: string
  failed: boolean
  /** "11H 53M" (age of its newest data when the edition was published), "QUIET", "TIMED OUT" */
  text: string
  /** The same in words: "12 hours old", "no new events", "didn't answer". */
  words: string
}

function ageWords(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000))
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} old`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} old`
  return `${Math.round(hours / 24)} days old`
}

export function sourceLines(run: Edition): SourceLine[] {
  const at = new Date(run.finished_at ?? run.started_at).getTime()
  const out: SourceLine[] = []
  for (const id of SOURCE_ORDER) {
    const r = run.sources?.[id]
    if (!r) continue
    const name = SOURCE_NAMES[id]
    if (r.status !== 'ok') {
      const words = r.status === 'empty' ? 'sent nothing' : "didn't answer"
      out.push({ id, name, failed: true, text: (STATUS_WORDS[r.status] ?? r.status).toUpperCase(), words })
      continue
    }
    const newest = r.newest_observation_at ? new Date(r.newest_observation_at).getTime() : null
    const age = newest === null ? null : at - newest
    if (EVENT_DRIVEN.has(id) && (age === null || age > QUIET_AFTER_MS)) {
      out.push({ id, name, failed: false, text: 'QUIET', words: 'no new events' })
    } else {
      out.push({ id, name, failed: false, text: age === null ? '—' : shortAge(age), words: age === null ? 'no data' : ageWords(age) })
    }
  }
  return out
}

/**
 * One or two sentences for the top of the edition when a source failed or a
 * category is last-known in it; null when everything answered.
 */
export function lateNotice(run: Edition, status: CategoryStatus[]): string | null {
  const silent: string[] = []
  const empty: string[] = []
  for (const id of SOURCE_ORDER) {
    const r = run.sources?.[id]
    if (!r || r.status === 'ok') continue
    ;(r.status === 'empty' ? empty : silent).push(SOURCE_WORDS[id] ?? id)
  }
  const stale = status
    .filter((c) => c.last_known)
    .map((c) => c.category)
    .sort((a: Category, b: Category) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
  const news = stale.length > 0 ? `${listText(stale.map((c) => CATEGORY_WORDS[c]))} news is as last reported` : null

  const said: string[] = []
  if (silent.length > 0) said.push(`${listText(silent)} didn't answer this time`)
  if (empty.length > 0) said.push(`${listText(empty)} sent nothing this time`)
  if (said.length === 0) return news ? `${cap(news)}.` : null
  return `${cap(listText(said))}${news ? `, so ${news}` : ''}.`
}

const CATEGORY_WORDS: Record<Category, string> = {
  cyclone: 'cyclone',
  flood: 'flood',
  earthquake: 'earthquake',
  air: 'air quality',
  fire: 'fire',
}

/** What each source gives the desk, in words (the Sources page). */
export const SOURCE_ROLES: Record<string, string> = {
  FIRMS: 'Fire detections from the VIIRS instrument on the NOAA-20 satellite',
  USGS: 'Earthquakes of magnitude 4 and above, worldwide',
  GDACS: 'Cyclone, flood and forest-fire alerts',
  EONET: 'Natural events; shown on no item, kept for the record',
  OPENAQ: 'Readings from public air monitors; the backup for air',
  DATAGOV: "India's live air quality index; the main source for air",
}

/** Which sources each category reads (static: the pipeline's stages). */
export const CATEGORY_SOURCE_MAP: { category: Category; main: string; also: string | null }[] = [
  { category: 'cyclone', main: 'GDACS', also: null },
  { category: 'flood', main: 'GDACS', also: null },
  { category: 'earthquake', main: 'USGS', also: null },
  { category: 'air', main: 'DATAGOV', also: 'OPENAQ' },
  { category: 'fire', main: 'FIRMS', also: 'GDACS' },
]

export type CellState = 'new' | 'same' | 'empty' | 'failed' | 'none'

/** One source in one run, for the status grid: new data, nothing new, sent nothing, didn't answer, not read. */
export function cellState(r: RunSourceResult | undefined): CellState {
  if (!r) return 'none'
  if (r.status === 'ok') return r.new_data ? 'new' : 'same'
  return r.status === 'empty' ? 'empty' : 'failed'
}

export const CELL_WORDS: Record<CellState, string> = {
  new: 'new data',
  same: 'nothing new',
  empty: 'sent nothing',
  failed: "didn't answer",
  none: 'not read',
}
