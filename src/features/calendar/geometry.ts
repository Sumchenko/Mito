import { addDays, startOfLocalDate, type LocalDate, type Timestamp } from '@/data'

/*
 * Calendar time geometry: wall-clock minutes within a day, DST-safe moments, snapping and the
 * side-by-side layout of overlapping blocks. Screen mapping lives in zoom/camera.ts.
 */

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY_MIN = 24 * 60
/** Every drag snaps to this grid. */
export const SNAP_MIN = 15

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

