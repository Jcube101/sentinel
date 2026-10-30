// The caveats, kept out of the story (style guide, Facts in the story,
// caveats in notes): the source line under each item, the "As of" kicker over
// a last-known item, and the Notes at the foot of the page. Like the copy,
// built only from the edition's own data.

import type { DeskEntry } from './entries'
import { istDay, istShortDate, istTime } from './ist'
import { SCALE, type Scale } from './scale'
import type { Level } from './types'
import { listText, numberWord, relativeDay } from './words'

// FIRMS's night pass over India ends around 21:00 UTC. A day whose data stops
// before this hour lacks it, so its counts are incomplete (No. 26: 27 Oct ran
// only to 09:07 UTC).
const NIGHT_PASS_UTC = 'T18:00:00Z'

/** The IST time a fire day's data stops at, when the night pass is missing; null when complete or unknown. */
export function fireDayCutOff(e: DeskEntry): string | null {
  const f = e.figures
  const to = typeof f.data_to === 'string' ? f.data_to : null
  if (!f.day || !to) return null
  return Date.parse(to) < Date.parse(`${f.day}${NIGHT_PASS_UTC}`) ? istTime(to) : null
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Why a last-known item wasn't updated, for its source line. */
function staleWords(e: DeskEntry): string {
  if (e.carriedFrom !== null) return `check failed; figures from No. ${e.carriedFrom}`
  if (e.lastKnownWhy && /assessment failed this run$/.test(e.lastKnownWhy)) return 'check failed this time'
  return "didn't answer this time"
}

// A cyclone's position older than this, against the edition, gets its time in
// the source line (No. 30-31: Arnab's position is from 28 Oct, 11:30 IST).
const POSITION_AGE_MS = 6 * 60 * 60 * 1000

/** "position as of 28 Oct, 11:30 IST" when a cyclone's position (plan P7) is more than six hours older than the edition; else null. */
export function positionAsOf(e: DeskEntry, editionAt: string): string | null {
  const at = e.category === 'cyclone' ? e.figures.position?.at : null
  if (typeof at !== 'string') return null
  const age = Date.parse(editionAt) - Date.parse(at)
  return age > POSITION_AGE_MS ? `position as of ${istShortDate(at)}, ${istTime(at)} IST` : null
}

/**
 * The item's source line, like a photo credit: "CPCB live data (unvalidated)",
 * "Sentinel estimate from OpenAQ monitors", "NASA FIRMS satellites (27 Oct
 * incomplete: no data after 14:37 IST)", "GDACS (position as of 28 Oct, 11:30
 * IST)". Printed after "Source: ". The edition's run time dates a cyclone's
 * position.
 */
export function sourceCredit(e: DeskEntry, editionAt: string): string {
  const items = e.members.length > 0 ? e.members : [e]
  const f = e.figures
  const quals: string[] = []
  let base: string
  switch (e.category) {
    case 'fire': {
      base = 'NASA FIRMS satellites'
      if (items.some((x) => Array.isArray(x.figures.gdacs_wildfire) && x.figures.gdacs_wildfire.length > 0)) base += '; GDACS forest-fire alert'
      const cut = items.find((x) => fireDayCutOff(x) !== null)
      if (cut?.figures.day) quals.push(`${DAY.format(new Date(`${cut.figures.day}T00:00:00Z`))} incomplete: no data after ${fireDayCutOff(cut)} IST`)
      break
    }
    case 'air':
      if (f.source === 'openaq' || f.approximate) base = 'Sentinel estimate from OpenAQ monitors'
      else {
        base = 'CPCB live data'
        if (f.unvalidated || f.source === 'datagov') quals.push('unvalidated')
      }
      break
    case 'earthquake':
      base = 'USGS'
      break
    default: {
      base = 'GDACS'
      const pos = positionAsOf(e, editionAt)
      if (pos) quals.push(pos)
    }
  }
  const credit = base + (quals.length > 0 ? ` (${quals.join('; ')})` : '')
  return e.lastKnown ? `${credit} · ${staleWords(e)}` : credit
}

/**
 * The kicker over a last-known item's title: when its figures date from,
 * relative to the edition ("As of Saturday", "As of yesterday", "As of
 * 14:00 IST"). "Not updated" when the figures carry no time; null when the
 * item is up to date.
 */
export function asOfKicker(e: DeskEntry, editionAt: string): string | null {
  if (!e.lastKnown) return null
  const at = e.asOf
  if (!at) return 'Not updated'
  if (at.length > 10 && istDay(at) === istDay(editionAt)) return `As of ${istTime(at)} IST`
  const day = at.length === 10 ? at : istDay(at)
  return `As of ${relativeDay(day, editionAt).replace(/^on /, '')}`
}

export interface DeskNote {
  key: string
  text: string
  /** A held level, drawn as squares before the text. */
  squares?: { level: Level; wouldBe: Level }
}

function stateName(e: DeskEntry): string {
  return String(e.figures.state ?? e.title)
}

/**
 * The page's Notes: each caveat said once, for the items it applies to.
 * Held fire levels (the dashed square) and Severe cities not yet confirmed,
 * under the edition's rules.
 */
export function deskNotes(entries: DeskEntry[], scale: Scale = SCALE): DeskNote[] {
  const all = entries.flatMap((e) => (e.members.length > 0 ? e.members : [e]))
  const notes: DeskNote[] = []

  const held = all.filter((x) => x.wouldBe !== null)
  if (held.length > 0) {
    const byLevel = new Map<Level, string[]>()
    for (const x of held) byLevel.set(x.wouldBe!, [...(byLevel.get(x.wouldBe!) ?? []), stateName(x)])
    const who = [...byLevel]
      .sort((a, b) => a[0] - b[0])
      .map(([level, names]) => `${listText(names)} would be at Level ${level}`)
    notes.push({
      key: 'held',
      text:
        `Fire levels from satellite counts are held at Level ${held[0].level} for now, until live counts have been checked against ` +
        `past years. A dashed square shows the level a state would otherwise have: ${listText(who)}.`,
      squares: { level: held[0].level, wouldBe: held[0].wouldBe! },
    })
  }

  for (const x of all) {
    const cities = x.category === 'air' && Array.isArray(x.figures.severe_unconfirmed) ? x.figures.severe_unconfirmed : []
    if (cities.length === 0) continue
    notes.push({
      key: `severe:${x.key}`,
      text:
        `${listText(cities)} read severe in the latest report. A city counts as severe only after ` +
        `${numberWord(scale.air.severeConfirmRuns ?? SCALE.air.severeConfirmRuns)} reports in a row.`,
    })
  }
  return notes
}
