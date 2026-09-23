import { addDays, startOfLocalDate, toLocalDate, type LocalDate, type Timestamp } from '@/data'

export type PeriodKind = 'week' | 'month' | 'year' | 'custom'

/** A span of whole calendar days, both ends inclusive. Weeks start on Monday. */
export interface Period {
  kind: PeriodKind
  from: LocalDate
  to: LocalDate
}

const parts = (day: LocalDate) => day.split('-').map(Number) as [number, number, number]
const date = (y: number, m: number, d: number) => toLocalDate(new Date(y, m - 1, d))

/** Monday = 0 … Sunday = 6. */
export const weekday = (day: LocalDate) => (new Date(startOfLocalDate(day)).getDay() + 6) % 7

/** The week, month or year that contains `anchor`. */
export function periodOf(kind: Exclude<PeriodKind, 'custom'>, anchor: LocalDate): Period {
  const [y, m] = parts(anchor)
  switch (kind) {
    case 'week': {
      const from = addDays(anchor, -weekday(anchor))
      return { kind, from, to: addDays(from, 6) }
    }
    case 'month':
      return { kind, from: date(y, m, 1), to: date(y, m + 1, 0) }
    case 'year':
      return { kind, from: date(y, 1, 1), to: date(y, 12, 31) }
  }
}

/** A custom span; the ends may be given in either order. */
export function customPeriod(a: LocalDate, b: LocalDate): Period {
  return a <= b ? { kind: 'custom', from: a, to: b } : { kind: 'custom', from: b, to: a }
}

/** Number of days in the period. */
export function periodLength(p: Period) {
  return Math.round((startOfLocalDate(addDays(p.to, 1)) - startOfLocalDate(p.from)) / 86_400_000)
}

/** The neighbouring period of the same kind: previous (-1) or next (+1). */
export function shiftPeriod(p: Period, dir: 1 | -1): Period {
  if (p.kind === 'custom') {
    const n = periodLength(p) * dir
    return { kind: 'custom', from: addDays(p.from, n), to: addDays(p.to, n) }
  }
  const [y, m] = parts(p.from)
  if (p.kind === 'week') return periodOf('week', addDays(p.from, 7 * dir))
  if (p.kind === 'month') return periodOf('month', date(y, m + dir, 1))
  return periodOf('year', date(y + dir, 1, 1))
}

/** [start, end) in epoch ms. */
export function periodRange(p: Period): [Timestamp, Timestamp] {
  return [startOfLocalDate(p.from), startOfLocalDate(addDays(p.to, 1))]
}

/** Every day of the period, in order. */
export function periodDays(p: Period): LocalDate[] {
  const days: LocalDate[] = []
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) days.push(d)
  return days
}

/** Days of the period that have already started — averages must not count the future. */
export function elapsedDays(p: Period, today: LocalDate) {
  if (today < p.from) return 0
  if (today > p.to) return periodLength(p)
  return periodLength({ ...p, to: today })
}

/** Long periods are charted by week, short ones by day. */
export const bucketOf = (p: Period): 'day' | 'week' | 'month' =>
  p.kind === 'year' || periodLength(p) > 180 ? 'month' : periodLength(p) > 62 ? 'week' : 'day'
