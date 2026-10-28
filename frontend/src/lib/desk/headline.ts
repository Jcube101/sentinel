// The desk's headline: one or two sentences built from the ranked items and
// the changes since yesterday. Templates only, so the headline never says
// more than the figures do (no forecasts, causes or land cover).

import { AIR_BAND_LABELS, airTop, type DeskEntry } from './entries'
import type { SinceYesterday } from './changes'
import type { Category, Level } from './types'

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** Newspaper style: one to nine in words, 10 and up in figures. */
export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** A ratio as the pipeline prints it in reasons: 9.07×, 12×. */
export function ratioText(r: number): string {
  return r < 10 ? r.toFixed(2) : r.toFixed(0)
}

/** How many desk rows sit at each level (a group of quakes is one row). */
export function levelCounts(entries: DeskEntry[]): Record<Level, number> {
  const out: Record<Level, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
  for (const e of entries) out[e.level] += 1
  return out
}

/**
 * The entry as the subject of a sentence, lower case where it isn't a name:
 * "fire activity in Chhattisgarh at 9.07× the seasonal norm",
 * "very poor air in Panipat", "an M7.0 earthquake 191 km ENE of Nagqu, China".
 * GDACS titles (cyclones, floods) are names and stay as they are.
 */
export function subject(e: DeskEntry): string {
  const f = e.figures
  if (e.members.length > 0) return `${numberWord(e.members.length)} small earthquakes`
  if (e.category === 'fire' && typeof f.state === 'string') {
    if (typeof f.ratio_to_norm === 'number') return `fire activity in ${f.state} at ${ratioText(f.ratio_to_norm)}× the seasonal norm`
    if (Array.isArray(f.gdacs_wildfire) && f.gdacs_wildfire.length > 0) return `a forest fire alert in ${f.state}`
  }
  if (e.category === 'air') {
    const top = airTop(f)
    if (top) {
      const where = top.cities.length === 1 ? top.cities[0].city : `${numberWord(top.cities.length)} cities`
      return `${AIR_BAND_LABELS[top.band].toLowerCase()} air in ${where}`
    }
  }
  if (e.category === 'earthquake' && typeof f.magnitude === 'number') {
    const q = `an M${f.magnitude.toFixed(1)} earthquake`
    if (!e.placeName) return q
    return /^\d/.test(e.placeName) ? `${q} ${e.placeName}` : `${q} near ${e.placeName}`
  }
  return e.title
}

const PLURAL: Partial<Record<Category, (n: number) => string>> = {
  fire: (n) => `fire activity in ${numberWord(n)} states`,
  earthquake: (n) => `${numberWord(n)} earthquakes`,
  cyclone: (n) => `${numberWord(n)} cyclones`,
  flood: (n) => `${numberWord(n)} floods`,
}

/** Several entries as one list, with same-category items counted together. */
function groupedSubjects(entries: DeskEntry[]): string[] {
  const out: string[] = []
  const done = new Set<Category>()
  for (const e of entries) {
    if (done.has(e.category)) continue
    const same = entries.filter((x) => x.category === e.category)
    const plural = PLURAL[e.category]
    if (same.length > 1 && plural) {
      out.push(plural(same.length))
      done.add(e.category)
    } else {
      out.push(subject(e))
    }
  }
  return out
}

function leadSentence(entries: DeskEntry[], since: SinceYesterday | null): { text: string; named: Set<string> } {
  if (entries.length === 0) return { text: 'Nothing is open on the desk.', named: new Set() }
  const top = entries[0].level
  if (top === 1) return { text: 'Nothing on the desk is above Level 1.', named: new Set() }
  const tops = entries.filter((e) => e.level === top)
  if (tops.length > 1) {
    return {
      text: `${cap(numberWord(tops.length))} items lead the desk at Level ${top}: ${listText(groupedSubjects(tops))}.`,
      named: new Set(),
    }
  }
  const lead = tops[0]
  const named = new Set(lead.itemIds)
  const move = since?.byItem.get(lead.key)
  if (move && (move.kind === 'new' || move.kind === 'reopened')) {
    const when = move.kind === 'new' ? 'new since yesterday' : 'reopened since yesterday'
    return { text: `${cap(subject(lead))}, ${when}, is the most severe item on the desk.`, named }
  }
  // Close a place's comma before the verb: "… of Nagqu, China, is …".
  const subj = cap(subject(lead)) + (subject(lead).includes(', ') ? ',' : '')
  if (move?.kind === 'escalated' && move.from !== null) {
    return { text: `${subj} is the most severe item on the desk, up from Level ${move.from} yesterday.`, named }
  }
  return { text: `${subj} is the most severe item on the desk.`, named }
}

function changeSentence(entries: DeskEntry[], since: SinceYesterday, named: Set<string>): string | null {
  // Every open item, grouped quakes taken apart, in desk order.
  const byId = new Map<string, DeskEntry>()
  for (const e of entries) for (const x of e.members.length ? e.members : [e]) byId.set(x.key, x)
  const open = (kinds: string[]) =>
    since.moves
      .filter((m) => kinds.includes(m.kind) && !named.has(m.itemId) && byId.has(m.itemId))
      .map((m) => ({ m, e: byId.get(m.itemId)! }))

  const news = open(['new', 'reopened'])
  if (news.length > 0) {
    const s = news.map((x) => subject(x.e))
    const rest = news.length > 2 ? `${s[0]} and ${numberWord(news.length - 1)} more` : listText(s)
    return `New since yesterday: ${rest}.`
  }
  const ups = open(['escalated'])
  if (ups.length === 1) return `Since yesterday, ${subject(ups[0].e)} rose to Level ${ups[0].m.to}.`
  if (ups.length > 1) {
    return `${cap(numberWord(ups.length))} items rose since yesterday, the highest ${subject(ups[0].e)} at Level ${ups[0].m.to}.`
  }
  const down = since.counts.deescalated
  const closed = since.counts.closed
  const parts: string[] = []
  if (down > 0) parts.push(`${numberWord(down)} ${down === 1 ? 'item' : 'items'} eased`)
  if (closed > 0) parts.push(`${numberWord(closed)} ${parts.length === 0 ? (closed === 1 ? 'item ' : 'items ') : ''}closed`)
  if (parts.length > 0) return `Since yesterday, ${parts.join(' and ')}.`
  if (since.moves.length === 0) return 'No change since yesterday.'
  return null // the only change is the lead's own, already said
}

/** The headline for an edition. Without the changes since yesterday, the lead sentence only. */
export function headline(entries: DeskEntry[], since: SinceYesterday | null): string {
  const lead = leadSentence(entries, since)
  const change = since ? changeSentence(entries, since, lead.named) : null
  return change ? `${lead.text} ${change}` : lead.text
}

/** "1 new · 2 escalated · 3 closed" (counts above zero only), or null. */
export function changeCounts(since: SinceYesterday): string | null {
  const c = since.counts
  const parts: string[] = []
  if (c.new + c.reopened > 0) parts.push(`${c.new + c.reopened} new`)
  if (c.escalated > 0) parts.push(`${c.escalated} escalated`)
  if (c.deescalated > 0) parts.push(`${c.deescalated} de-escalated`)
  if (c.closed > 0) parts.push(`${c.closed} closed`)
  return parts.length > 0 ? parts.join(' · ') : null
}
