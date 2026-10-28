// Dates and times in India Standard Time, which is how the desk talks about editions.

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function parts(iso: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of PARTS.formatToParts(new Date(iso))) out[p.type] = p.value
  return out
}

/** "Wed 28 Oct 2026" */
export function istDate(iso: string): string {
  const p = parts(iso)
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`
}

/** "28 Oct" */
export function istShortDate(iso: string): string {
  const p = parts(iso)
  return `${p.day} ${p.month}`
}

/** "02:30" */
export function istTime(iso: string): string {
  const p = parts(iso)
  return `${p.hour}:${p.minute}`
}

/** A duration as the desk prints it: "42M", "11H 53M", "3D". */
export function shortAge(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000))
  if (mins < 60) return `${mins}M`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}H ${mins % 60}M`
  return `${Math.floor(hours / 24)}D`
}
