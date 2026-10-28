// Small pieces of plain English the desk's copy is built from (docs/style-guide.md).
// Pure functions: the same inputs always give the same words, so past editions
// print as they did when they were published.

import { istDay } from './ist'

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** One to nine in words, 10 and up in figures. */
export function numberWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "a", "a and b", "a, b and c" */
export function listText(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** "Chhattisgarh's", "Andaman and Nicobar Islands'" */
export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`
}

function roundMultiple(r: number): number {
  return r < 20 ? Math.round(r) : Math.round(r / 5) * 5
}

/** A multiple for titles: "nine times normal", "twice normal", "normal". */
export function timesNormal(r: number): string {
  if (r < 1.25) return 'normal'
  if (r < 1.75) return 'one and a half times normal'
  if (r < 2.5) return 'twice normal'
  return `${numberWord(roundMultiple(r))} times normal`
}

/** A multiple for standfirsts: "about nine times usual", "about twice the usual". */
export function timesUsual(r: number): string {
  if (r < 1.25) return 'about usual'
  if (r < 1.75) return 'about one and a half times usual'
  if (r < 2.5) return 'about twice the usual'
  return `about ${numberWord(roundMultiple(r))} times usual`
}

/** A typical count, rounded: "about 3", "about 70", "about 140", "almost none". */
export function aboutCount(n: number): string {
  if (n < 0.5) return 'almost none'
  if (n < 10) return `about ${Math.round(n)}`
  if (n < 100) return `about ${Math.round(n / 5) * 5}`
  return `about ${Math.round(n / 10) * 10}`
}

/** A distance, rounded: 48 → 50, 348 → 350, 1,234 → 1,250. */
export function roundKm(km: number): number {
  if (km < 100) return Math.max(5, Math.round(km / 5) * 5)
  if (km < 1000) return Math.round(km / 10) * 10
  return Math.round(km / 50) * 50
}

const LONG_MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

function noon(day: string): Date {
  return new Date(`${day}T12:00:00Z`)
}

/**
 * A calendar day relative to the edition's IST date: "today", "yesterday",
 * "on Monday" (two to six days before), "on 19 Oct".
 */
export function relativeDay(day: string, editionAt: string): string {
  const diff = Math.round((noon(istDay(editionAt)).getTime() - noon(day).getTime()) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff >= 2 && diff <= 6) return `on ${WEEKDAY.format(noon(day))}`
  return `on ${DAY_MONTH.format(noon(day))}`
}

/** The time of year a day falls in: "early November", "mid-October", "late October". */
export function partOfMonth(day: string): string {
  const d = noon(day)
  const date = d.getUTCDate()
  const month = LONG_MONTH.format(d)
  return date <= 10 ? `early ${month}` : date <= 20 ? `mid-${month}` : `late ${month}`
}

/** The baseline years after "any day at this time of year": "in 2024 or 2025", "between 2019 and 2025". */
export function inYears(years: string): string {
  const [a, b] = years.split(/[-–]/).map((y) => y.trim())
  if (!b || a === b) return `in ${a}`
  if (Number(b) - Number(a) === 1) return `in ${a} or ${b}`
  return `between ${a} and ${b}`
}

/** USGS magnitude classes. */
export function quakeStrength(m: number): string {
  if (m < 4) return 'minor'
  if (m < 5) return 'light'
  if (m < 6) return 'moderate'
  if (m < 7) return 'strong'
  if (m < 8) return 'major'
  return 'great'
}

const ALERT_RANK: Record<string, string> = {
  red: 'highest',
  orange: 'second-highest',
  yellow: 'second-lowest',
  green: 'lowest',
}

/** An alert colour's place on its scale: "highest" (red) … "lowest" (green). */
export function alertRankWord(colour: string): string | null {
  return ALERT_RANK[colour.toLowerCase()] ?? null
}

/** "their highest alert, red" */
export function alertRank(colour: string, whose: string): string {
  const c = colour.toLowerCase()
  const rank = alertRankWord(c)
  return rank ? `${whose} ${rank} alert, ${c}` : `${whose} ${c} alert`
}

/** A source as a reader knows it (style guide, Words). */
export const SOURCE_WORDS: Record<string, string> = {
  FIRMS: "NASA's fire satellites",
  GDACS: 'the global disaster monitors',
  USGS: 'the US Geological Survey',
  EONET: "NASA's natural-event tracker",
  OPENAQ: "OpenAQ's public air monitors",
  DATAGOV: "the pollution control board's live feed",
}

/**
 * Why an item is last-known, in words. The pipeline's notes: "FIRMS fetch
 * failed this run", "fire assessment failed this run", or the air stage's own.
 */
export function lastKnownWords(why: string | null): string {
  if (!why) return "its source didn't answer this time"
  const fetch = /^(\w+) fetch failed this run$/.exec(why)
  if (fetch) return `${SOURCE_WORDS[fetch[1]] ?? fetch[1]} didn't answer this time`
  const stage = /^(\w+) assessment failed this run$/.exec(why)
  if (stage) return `this report's ${stage[1]} check failed`
  return why
}

// --- where fires are -----------------------------------------------------------------

type Region = 'north' | 'central' | 'east' | 'west' | 'south' | 'northeast' | 'islands'

/** Rough centre and region of each state and union territory, as named in the fire data. */
const STATES: Record<string, [number, number, Region]> = {
  'Andaman and Nicobar Islands': [11.7, 92.7, 'islands'],
  'Andhra Pradesh': [15.9, 79.7, 'south'],
  'Arunachal Pradesh': [28.2, 94.7, 'northeast'],
  Assam: [26.2, 92.9, 'northeast'],
  Bihar: [25.8, 85.6, 'east'],
  Chandigarh: [30.7, 76.8, 'north'],
  Chhattisgarh: [21.3, 81.9, 'central'],
  'Dadra and Nagar Haveli and Daman and Diu': [20.3, 73.0, 'west'],
  Delhi: [28.6, 77.2, 'north'],
  Goa: [15.4, 74.0, 'west'],
  Gujarat: [22.7, 71.6, 'west'],
  Haryana: [29.1, 76.1, 'north'],
  'Himachal Pradesh': [31.9, 77.2, 'north'],
  'Jammu and Kashmir': [33.5, 75.1, 'north'],
  Jharkhand: [23.6, 85.3, 'east'],
  Karnataka: [15.0, 75.7, 'south'],
  Kerala: [10.4, 76.4, 'south'],
  Ladakh: [34.2, 77.6, 'north'],
  Lakshadweep: [10.6, 72.6, 'islands'],
  'Madhya Pradesh': [23.5, 78.4, 'central'],
  Maharashtra: [19.4, 76.1, 'west'],
  Manipur: [24.7, 93.9, 'northeast'],
  Meghalaya: [25.5, 91.3, 'northeast'],
  Mizoram: [23.2, 92.8, 'northeast'],
  Nagaland: [26.1, 94.5, 'northeast'],
  Odisha: [20.5, 84.4, 'east'],
  Puducherry: [11.9, 79.8, 'south'],
  Punjab: [30.9, 75.4, 'north'],
  Rajasthan: [26.6, 73.8, 'north'],
  Sikkim: [27.5, 88.5, 'northeast'],
  'Tamil Nadu': [11.0, 78.4, 'south'],
  Telangana: [17.9, 79.0, 'south'],
  Tripura: [23.8, 91.7, 'northeast'],
  'Uttar Pradesh': [26.9, 80.9, 'north'],
  Uttarakhand: [30.1, 79.2, 'north'],
  'West Bengal': [23.4, 87.9, 'east'],
}

const REGION_WORDS: Record<Region, string> = {
  north: 'northern India',
  central: 'central India',
  east: 'eastern India',
  west: 'western India',
  south: 'southern India',
  northeast: 'the northeast',
  islands: 'the islands',
}

// The middle of the country, near Jabalpur; states whose centre of mass is
// within CENTRE_KM of it are "across central India".
const MIDDLE: [number, number] = [22.5, 79.0]
const CENTRE_KM = 250

function km([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const rad = Math.PI / 180
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.sqrt(x * x + y * y) * 6371
}

export interface Where {
  /** "across central India", "in Gujarat and Telangana", "in four states" */
  inText: string
  /** For "spreading": "across central India", "to four states", "in Gujarat" */
  spreadText: string
}

/** Where a set of states lies, in words. */
export function whereStates(states: string[]): Where {
  if (states.length <= 2) {
    const t = `in ${listText(states)}`
    return { inText: t, spreadText: t }
  }
  const known = states.map((s) => STATES[s]).filter(Boolean)
  const regions = [...new Set(known.map((k) => k[2]))]
  const count = `${numberWord(states.length)} states`
  if (known.length === states.length) {
    if (regions.length === 1) {
      const t = `across ${REGION_WORDS[regions[0]]}`
      return { inText: t, spreadText: t }
    }
    const mid: [number, number] = [
      known.reduce((a, k) => a + k[0], 0) / known.length,
      known.reduce((a, k) => a + k[1], 0) / known.length,
    ]
    if (km(mid, MIDDLE) <= CENTRE_KM) return { inText: 'across central India', spreadText: 'across central India' }
    if (regions.length === 2 && !regions.includes('islands') && !regions.includes('northeast')) {
      const [a, b] = regions.map((r) => REGION_WORDS[r].replace(' India', ''))
      const t = `across ${a} and ${b} India`
      return { inText: t, spreadText: t }
    }
  }
  return { inText: `in ${count}`, spreadText: `to ${count}` }
}
