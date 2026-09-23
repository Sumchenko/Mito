import {
  addDays,
  dayRange,
  toLocalDate,
  type Id,
  type LocalDate,
  type Task,
  type TimeBlock,
  type TimeEntry,
  type Timestamp,
} from '@/data'
import { clip, forEachHour, length, overlap, union, type Interval } from './intervals'
import { elapsedDays, periodDays, periodRange, weekday, type Period } from './period'

const MIN = 60_000
/** A day counts as active from this much tracked time. */
export const ACTIVE_DAY_MS = 15 * MIN
/** An estimate is "accurate" when the actual time is within this factor of it. */
const ACCURATE_WITHIN = 1.25

export interface ReportInput {
  period: Period
  now: Timestamp
  /** At least every entry that overlaps the period (others are ignored). */
  entries: readonly TimeEntry[]
  /** At least every block that overlaps the period. */
  blocks: readonly TimeBlock[]
  /** All tasks, for titles, projects, tags and subtask roll-up. */
  tasks: readonly Task[]
  /** All-time tracked ms per task, for estimate accuracy. */
  trackedTotals?: ReadonlyMap<Id, number>
}

export interface DayReport {
  trackedMs: number
  /** Time planned on task blocks (overlapping blocks of one task counted once). */
  plannedMs: number
  /** Planned time covered by work on the same task that day, at any hour. */
  doneMs: number
  /** Planned time covered by work on the same task at the planned hours. */
  onTimeMs: number
  byProject: Map<Id | null, number>
}

export interface ProjectShare {
  projectId: Id | null
  ms: number
  /** Top-level tasks (subtasks rolled into their parent); `null` is time without a task. */
  tasks: { taskId: Id | null; ms: number }[]
}

export interface EstimateItem {
  taskId: Id
  estimateMs: number
  trackedMs: number
  /** tracked / estimate: above 1 took longer than expected. */
  ratio: number
}

export interface Report {
  period: Period
  days: LocalDate[]
  elapsedDays: number
  trackedMs: number
  /** Timer runs that touch the period. */
  sessions: number
  pomodoros: number
  longestSessionMs: number
  noTaskMs: number
  activeDays: number
  /** Average over elapsed days of the period, active or not. */
  avgPerDayMs: number
  tasksDone: number
  byDay: Map<LocalDate, DayReport>
  projects: ProjectShare[]
  tags: { tagId: Id; ms: number }[]
  /** Tracked ms by weekday (Mon = 0) and hour. */
  heat: number[][]
  plan: {
    plannedMs: number
    doneMs: number
    onTimeMs: number
    /** Tracked time that no plan asked for that day. */
    unplannedMs: number
    /** doneMs / plannedMs, or null without a plan. */
    completion: number | null
    /** onTimeMs / plannedMs, or null without a plan. */
    accuracy: number | null
  }
  estimates: {
    items: EstimateItem[]
    medianRatio: number | null
    /** Share of estimates within ±25%. */
    accurateShare: number | null
  }
}

const median = (values: number[]) => {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}
const add = <K>(map: Map<K, number>, key: K, value: number) => map.set(key, (map.get(key) ?? 0) + value)

/**
 * Everything the statistics page shows about one period, computed from raw records.
 * Pure: the same input always gives the same report, which keeps it testable and lets the
 * AI mentor reuse it as its picture of the user's time.
 */
export function buildReport({ period, now, entries, blocks, tasks, trackedTotals }: ReportInput): Report {
  const [from, to] = periodRange(period)
  const days = periodDays(period)
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  /** Subtasks are accounted to their parent: that is what plans and projects are about. */
  const ownerOf = (taskId?: Id) => {
    if (!taskId) return null
    return taskById.get(taskId)?.parentId ?? taskId
  }
  const projectOf = (owner: Id | null) => (owner ? (taskById.get(owner)?.projectId ?? null) : null)
  const tagsOf = (taskId?: Id) => {
    const task = taskId ? taskById.get(taskId) : undefined
    if (!task) return []
    const parent = task.parentId ? taskById.get(task.parentId) : undefined
    return [...new Set([...task.tagIds, ...(parent?.tagIds ?? [])])]
  }

  const byDay = new Map<LocalDate, DayReport>(
    days.map((d) => [d, { trackedMs: 0, plannedMs: 0, doneMs: 0, onTimeMs: 0, byProject: new Map() }]),
  )
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const projectTasks = new Map<Id | null, Map<Id | null, number>>()
  const tagMs = new Map<Id, number>()
  // Per day and owner task: worked intervals and planned intervals, for plan vs fact.
  const worked = new Map<string, Interval[]>()
  const planned = new Map<string, Interval[]>()
  const key = (day: LocalDate, owner: Id) => `${day}|${owner}`

  let trackedMs = 0
  let sessions = 0
  let pomodoros = 0
  let longestSessionMs = 0
  let noTaskMs = 0

  for (const entry of entries) {
    if (entry.deletedAt) continue
    const part = clip(entry.start, entry.end ?? now, from, to)
    if (!part) continue
    const [s, e] = part
    sessions++
    if (entry.source === 'pomodoro') pomodoros++
    longestSessionMs = Math.max(longestSessionMs, (entry.end ?? now) - entry.start)
    const owner = ownerOf(entry.taskId)
    const project = projectOf(owner)
    const ms = e - s
    trackedMs += ms
    if (!owner) noTaskMs += ms
    const perTask = projectTasks.get(project) ?? new Map<Id | null, number>()
    projectTasks.set(project, add(perTask, owner, ms))
    for (const tag of tagsOf(entry.taskId)) add(tagMs, tag, ms)

    forEachHour(s, e, (at, pieceMs) => {
      const day = toLocalDate(at)
      const d = byDay.get(day)
      if (!d) return
      d.trackedMs += pieceMs
      add(d.byProject, project, pieceMs)
      heat[weekday(day)]![new Date(at).getHours()]! += pieceMs
    })
    if (owner) {
      for (let day = toLocalDate(s); day <= toLocalDate(e - 1); day = addDays(day, 1)) {
        const [ds, de] = dayRange(day)
        const piece = clip(s, e, ds, de)
        if (!piece) continue
        const k = key(day, owner)
        worked.set(k, [...(worked.get(k) ?? []), piece])
      }
    }
  }

  for (const block of blocks) {
    if (block.deletedAt || block.kind !== 'task' || !block.taskId) continue
    const owner = ownerOf(block.taskId)!
    const part = clip(block.start, block.end, from, to)
    if (!part) continue
    for (let day = toLocalDate(part[0]); day <= toLocalDate(part[1] - 1); day = addDays(day, 1)) {
      const [ds, de] = dayRange(day)
      const piece = clip(part[0], part[1], ds, de)
      if (!piece) continue
      const k = key(day, owner)
      planned.set(k, [...(planned.get(k) ?? []), piece])
    }
  }

  let plannedMs = 0
  let doneMs = 0
  let onTimeMs = 0
  for (const [k, intervals] of planned) {
    const day = k.slice(0, 10) as LocalDate
    const d = byDay.get(day)
    if (!d) continue
    const plan = union(intervals)
    const work = union(worked.get(k) ?? [])
    const p = length(plan)
    const done = Math.min(p, length(work))
    const onTime = overlap(plan, work)
    d.plannedMs += p
    d.doneMs += done
    d.onTimeMs += onTime
    plannedMs += p
    doneMs += done
    onTimeMs += onTime
  }

  const projects: ProjectShare[] = [...projectTasks]
    .map(([projectId, perTask]) => ({
      projectId,
      ms: [...perTask.values()].reduce((a, b) => a + b, 0),
      tasks: [...perTask].map(([taskId, ms]) => ({ taskId, ms })).sort((a, b) => b.ms - a.ms),
    }))
    .sort((a, b) => b.ms - a.ms)

  const done = tasks.filter(
    (t) => !t.deletedAt && t.status === 'done' && t.completedAt !== undefined && t.completedAt >= from && t.completedAt < to,
  )

  // Estimates: finished tasks with an estimate; a parent's time includes its subtasks'.
  const children = new Map<Id, Id[]>()
  for (const t of tasks) if (t.parentId) children.set(t.parentId, [...(children.get(t.parentId) ?? []), t.id])
  const items: EstimateItem[] = trackedTotals
    ? done
        .filter((t) => t.estimateMin)
        .map((t) => {
          const tracked = [t.id, ...(children.get(t.id) ?? [])].reduce((sum, id) => sum + (trackedTotals.get(id) ?? 0), 0)
          const estimateMs = t.estimateMin! * MIN
          return { taskId: t.id, estimateMs, trackedMs: tracked, ratio: tracked / estimateMs }
        })
        .filter((x) => x.trackedMs > 0)
        .sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)))
    : []

  const elapsed = elapsedDays(period, toLocalDate(now))
  return {
    period,
    days,
    elapsedDays: elapsed,
    trackedMs,
    sessions,
    pomodoros,
    longestSessionMs,
    noTaskMs,
    activeDays: [...byDay.values()].filter((d) => d.trackedMs >= ACTIVE_DAY_MS).length,
    avgPerDayMs: elapsed ? trackedMs / elapsed : 0,
    tasksDone: done.length,
    byDay,
    projects,
    tags: [...tagMs].map(([tagId, ms]) => ({ tagId, ms })).sort((a, b) => b.ms - a.ms),
    heat,
    plan: {
      plannedMs,
      doneMs,
      onTimeMs,
      unplannedMs: Math.max(0, trackedMs - doneMs),
      completion: plannedMs ? doneMs / plannedMs : null,
      accuracy: plannedMs ? onTimeMs / plannedMs : null,
    },
    estimates: {
      items,
      medianRatio: median(items.map((x) => x.ratio)),
      accurateShare: items.length
        ? items.filter((x) => x.ratio <= ACCURATE_WITHIN && x.ratio >= 1 / ACCURATE_WITHIN).length / items.length
        : null,
    },
  }
}

/**
 * Consecutive active days. The current streak ends today — or yesterday, so a streak is not
 * "broken" in the morning before any work was tracked.
 */
export function streaks(dailyMs: ReadonlyMap<LocalDate, number>, today: LocalDate, minMs = ACTIVE_DAY_MS) {
  const active = (d: LocalDate) => (dailyMs.get(d) ?? 0) >= minMs
  let current = 0
  let d = active(today) ? today : addDays(today, -1)
  while (active(d)) {
    current++
    d = addDays(d, -1)
  }
  let longest = 0
  let run = 0
  const sorted = [...dailyMs.keys()].sort()
  let prev: LocalDate | null = null
  for (const day of sorted) {
    if (!active(day)) {
      run = 0
    } else {
      run = prev && addDays(prev, 1) === day && active(prev) ? run + 1 : 1
      longest = Math.max(longest, run)
    }
    prev = day
  }
  return { current, longest: Math.max(longest, current) }
}

/** Tracked ms per local day over [from, to) — for the year map and streaks. */
export function dailyTracked(entries: readonly TimeEntry[], from: Timestamp, to: Timestamp, now: Timestamp) {
  const out = new Map<LocalDate, number>()
  for (const entry of entries) {
    if (entry.deletedAt) continue
    const part = clip(entry.start, entry.end ?? now, from, to)
    if (!part) continue
    for (let day = toLocalDate(part[0]); day <= toLocalDate(part[1] - 1); day = addDays(day, 1)) {
      const [ds, de] = dayRange(day)
      const piece = clip(part[0], part[1], ds, de)
      if (piece) add(out, day, piece[1] - piece[0])
    }
  }
  return out
}
