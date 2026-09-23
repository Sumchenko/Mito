import type { LocalDate, Timestamp } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Calendar day of a moment in the user's local timezone. */
export function toLocalDate(at: Date | Timestamp = Date.now()): LocalDate {
  const d = typeof at === 'number' ? new Date(at) : at
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as LocalDate
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** Local midnight at the start of the given day. */
export function startOfLocalDate(day: LocalDate): Timestamp {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d).getTime()
}

/** Shifts a calendar day; safe across DST changes because it works in calendar units. */
export function addDays(day: LocalDate, days: number): LocalDate {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return toLocalDate(new Date(y, m - 1, d + days))
}

/** [start, end) of a local day in epoch ms. Not always 24h long (DST). */
export function dayRange(day: LocalDate): [Timestamp, Timestamp] {
  return [startOfLocalDate(day), startOfLocalDate(addDays(day, 1))]
}
