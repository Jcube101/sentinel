// How each source fared in an edition: the footer line and the late notice.
// Built from pipeline_runs.sources of that run, never from the current
// sources table, so a past edition shows what was true when it ran.

import { CATEGORY_NAMES } from './levels'
import { shortAge } from './ist'
import type { CategoryStatus, Edition } from './types'

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

export interface SourceLine {
  id: string
  name: string
  failed: boolean
  /** "11H 53M" (age of its newest data when the edition was published), "QUIET", "TIMED OUT" */
  text: string
}

export function sourceLines(run: Edition): SourceLine[] {
  const at = new Date(run.finished_at ?? run.started_at).getTime()
  const out: SourceLine[] = []
  for (const id of SOURCE_ORDER) {
    const r = run.sources?.[id]
    if (!r) continue
    const name = SOURCE_NAMES[id]
    if (r.status !== 'ok') {
      out.push({ id, name, failed: true, text: (STATUS_WORDS[r.status] ?? r.status).toUpperCase() })
      continue
    }
    const newest = r.newest_observation_at ? new Date(r.newest_observation_at).getTime() : null
    const age = newest === null ? null : at - newest
    if (EVENT_DRIVEN.has(id) && (age === null || age > QUIET_AFTER_MS)) {
      out.push({ id, name, failed: false, text: 'QUIET' })
    } else {
      out.push({ id, name, failed: false, text: age === null ? '—' : shortAge(age) })
    }
  }
  return out
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * One or two sentences for the top of the edition when a source failed or a
 * category is last-known in it; null when everything answered.
 */
export function lateNotice(run: Edition, status: CategoryStatus[]): string | null {
  const byVerb = new Map<string, string[]>()
  for (const id of SOURCE_ORDER) {
    const r = run.sources?.[id]
    if (!r || r.status === 'ok') continue
    const verb = STATUS_WORDS[r.status] ?? r.status
    byVerb.set(verb, [...(byVerb.get(verb) ?? []), SOURCE_NAMES[id]])
  }
  const sentences: string[] = []
  for (const [verb, names] of byVerb) sentences.push(`${listText(names)} ${verb} in this run.`)

  const stale = status
    .filter((c) => c.last_known)
    .map((c) => c.category)
    .sort()
  if (stale.length > 0) {
    const names = stale.map((c, i) => (i === 0 ? CATEGORY_NAMES[c] : CATEGORY_NAMES[c].toLowerCase()))
    sentences.push(`${listText(names)} ${stale.length === 1 ? 'is' : 'are'} shown as last known.`)
  }
  return sentences.length > 0 ? sentences.join(' ') : null
}
