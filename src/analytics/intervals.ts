import type { Timestamp } from '@/data'

/** Half-open time interval [start, end). */
export type Interval = readonly [Timestamp, Timestamp]

/** Part of [start, end) inside [from, to), or null when they do not meet. */
export function clip(start: Timestamp, end: Timestamp, from: Timestamp, to: Timestamp): Interval | null {
  const s = Math.max(start, from)
  const e = Math.min(end, to)
  return e > s ? [s, e] : null
}

/** Merges overlapping or touching intervals into a sorted, disjoint list. */
export function union(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  const out: [Timestamp, Timestamp][] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

export const length = (intervals: readonly Interval[]) => intervals.reduce((sum, [s, e]) => sum + (e - s), 0)

/** Total length of the overlap of two disjoint sorted lists (as returned by `union`). */
export function overlap(a: readonly Interval[], b: readonly Interval[]) {
  let total = 0
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const [as, ae] = a[i]!
    const [bs, be] = b[j]!
    total += Math.max(0, Math.min(ae, be) - Math.max(as, bs))
    if (ae < be) i++
    else j++
  }
  return total
}

/**
 * Walks [start, end) in local clock-hour pieces: 09:40–11:10 gives 09:40–10:00, 10:00–11:00,
 * 11:00–11:10. Uses the Date API so DST days get their real 23 or 25 hours.
 */
export function forEachHour(start: Timestamp, end: Timestamp, fn: (pieceStart: Timestamp, ms: number) => void) {
  let t = start
  while (t < end) {
    const d = new Date(t)
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    // Guard against a clock that does not advance (ambiguous DST hours).
    const next = Math.min(end, d.getTime() > t ? d.getTime() : t + 3_600_000)
    fn(t, next - t)
    t = next
  }
}
