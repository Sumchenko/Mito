import { addDays, startOfLocalDate, type LocalDate, type Timestamp } from '@/data'

/*
 * Calendar geometry: pure mapping between time and pixels. The view is described by a
 * continuous model — first visible day, number of days, pixels per hour — so the semantic
 * zoom (stage 5) can animate these numbers instead of switching between hard-coded layouts.
 */

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY_MIN = 24 * 60
/** Every drag snaps to this grid. */
export const SNAP_MIN = 15

export type CalendarView = 'day' | '3days' | 'week'
export const VIEW_DAYS: Record<CalendarView, number> = { day: 1, '3days': 3, week: 7 }

/** Monday-based week start (ISO), as used in RU locale. */
export function startOfWeek(day: LocalDate): LocalDate {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const weekday = new Date(y, m - 1, d).getDay() // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7))
}

/** First visible day for a view that should contain `focus`. */
export const viewStart = (view: CalendarView, focus: LocalDate) =>
  view === 'week' ? startOfWeek(focus) : focus

export const daysFrom = (first: LocalDate, count: number) =>
  Array.from({ length: count }, (_, i) => addDays(first, i))

/** The moment `minutes` after local midnight of `day`. DST-safe: built from calendar parts. */
export function atMinutes(day: LocalDate, minutes: number): Timestamp {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 0, minutes).getTime()
}

/** Wall-clock minutes since midnight for a moment (what the user sees on a clock). */
export function minutesOfDay(at: Timestamp) {
  const d = new Date(at)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

/**
 * The part of [start, end) that falls on `day`, in wall-clock minutes. `null` when the
 * interval does not touch the day. Intervals crossing midnight are split across columns.
 */
export function dayPart(start: Timestamp, end: Timestamp, day: LocalDate) {
  const from = startOfLocalDate(day)
  const to = startOfLocalDate(addDays(day, 1))
  if (end <= from || start >= to) return null
  return {
    startMin: start <= from ? 0 : minutesOfDay(start),
    endMin: end >= to ? DAY_MIN : minutesOfDay(end),
  }
}

export const snap = (minutes: number, step = SNAP_MIN) => Math.round(minutes / step) * step

export const clampMinutes = (minutes: number) => Math.min(DAY_MIN, Math.max(0, minutes))

export const minutesToPx = (minutes: number, hourPx: number) => (minutes / 60) * hourPx
export const pxToMinutes = (px: number, hourPx: number) => (px / hourPx) * 60

/** Day under a horizontal position inside the columns area. */
export function dayAtX(x: number, width: number, days: LocalDate[]): LocalDate {
  const i = Math.min(days.length - 1, Math.max(0, Math.floor((x / width) * days.length)))
  return days[i]!
}

export interface Lane {
  lane: number
  lanes: number
}

/**
 * Side-by-side layout for overlapping items. Items that overlap (transitively) form a
 * cluster; each gets the first free lane, and every item in a cluster shares its lane count.
 */
export function layoutLanes<T extends { start: number; end: number }>(items: T[]): Map<T, Lane> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const result = new Map<T, Lane>()
  let cluster: T[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    for (const item of cluster) result.get(item)!.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    result.set(item, { lane, lanes: 0 })
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return result
}

