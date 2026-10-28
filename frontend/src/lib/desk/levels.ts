import type { Category, Level } from './types'

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Minor',
  2: 'Elevated',
  3: 'High',
  4: 'Severe',
}

export const CATEGORY_NAMES: Record<Category, string> = {
  earthquake: 'Earthquake',
  flood: 'Flood',
  cyclone: 'Cyclone',
  fire: 'Fire',
  air: 'Air quality',
}

export type NoteKind = 'last_known' | 'cap' | 'severe_unconfirmed' | 'other'

export interface ReasonNote {
  kind: NoteKind
  text: string
}

// The pipeline appends notes to a reason with " · ": last known
// (desk.LAST_KNOWN_SEP), the fire calibration cap (fire_desk), and Severe
// cities not yet confirmed (air). The reasons themselves never contain it.
const NOTE_SEP = ' · '
const LAST_KNOWN = 'last known: '

/** A reason split into the rule that set the level and the notes appended to it. */
export function splitReason(reason: string): { base: string; notes: ReasonNote[] } {
  const [base, ...rest] = reason.split(NOTE_SEP)
  const notes = rest.map((text): ReasonNote => {
    if (text.startsWith(LAST_KNOWN)) return { kind: 'last_known', text: text.slice(LAST_KNOWN.length) }
    if (text.startsWith('capped at Level')) return { kind: 'cap', text }
    if (text.startsWith('Severe in ') && text.includes('not yet confirmed')) {
      return { kind: 'severe_unconfirmed', text }
    }
    return { kind: 'other', text }
  })
  return { base, notes }
}
