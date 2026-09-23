import { bucketOf, weekday, type DayReport, type Report } from '@/analytics'
import { addDays, type Id, type LocalDate } from '@/data'

export interface Bucket {
  /** First day of the bucket. */
  key: LocalDate
  kind: 'day' | 'week' | 'month'
  days: LocalDate[]
  trackedMs: number
  plannedMs: number
  doneMs: number
  onTimeMs: number
  byProject: Map<Id | null, number>
}

/** Groups the report's days into chart bars: days, Monday-based weeks, or months. */
export function bucketize(report: Report): Bucket[] {
  const kind = bucketOf(report.period)
  const keyOf = (d: LocalDate): LocalDate =>
    kind === 'day' ? d : kind === 'week' ? addDays(d, -weekday(d)) : (`${d.slice(0, 7)}-01` as LocalDate)

  const out = new Map<LocalDate, Bucket>()
  for (const day of report.days) {
    const d: DayReport = report.byDay.get(day)!
    const key = keyOf(day)
    let b = out.get(key)
    if (!b) {
      b = { key, kind, days: [], trackedMs: 0, plannedMs: 0, doneMs: 0, onTimeMs: 0, byProject: new Map() }
      out.set(key, b)
    }
    b.days.push(day)
    b.trackedMs += d.trackedMs
    b.plannedMs += d.plannedMs
    b.doneMs += d.doneMs
    b.onTimeMs += d.onTimeMs
    for (const [p, ms] of d.byProject) b.byProject.set(p, (b.byProject.get(p) ?? 0) + ms)
  }
  return [...out.values()]
}

/** Calendar URL that shows a bucket: its day, week or month. */
export function calendarLink(b: Bucket) {
  const view = b.kind === 'day' ? 'day' : b.kind === 'week' ? 'week' : 'month'
  return `/calendar?date=${b.days[0]}&view=${view}`
}
