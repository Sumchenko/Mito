import { buildReport, customPeriod } from '@/analytics'
import {
  addDays,
  startOfLocalDate,
  toLocalDate,
  type Goal,
  type Id,
  type LocalDate,
  type Project,
  type Task,
  type TimeBlock,
  type TimeEntry,
  type Timestamp,
} from '@/data'
import { goalSignals } from './coach'
import type { ContextBlock, ContextTask, IntakeAbout, MentorContext } from './protocol'

/** Days of history the mentor looks back on. */
export const HISTORY_DAYS = 14
/** Days of calendar ahead the mentor sees. */
export const AHEAD_DAYS = 4
const MAX_TASKS = 60
const MIN = 60_000
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export interface ContextInput {
  now: Timestamp
  tasks: readonly Task[]
  projects: readonly Project[]
  /** Blocks from the history window through the days ahead. */
  blocks: readonly TimeBlock[]
  /** Entries over the history window, today included. */
  entries: readonly TimeEntry[]
  /** All-time tracked ms per task. */
  trackedTotals: ReadonlyMap<Id, number>
  /** Learning goals: their slippage goes into the brief. */
  goals?: readonly Goal[]
}

/** Short refs ↔ real ids: the model sees only refs; actions are resolved back through this. */
export interface RefMap {
  task: Map<string, Id>
  block: Map<string, Id>
}

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (at: Timestamp) => {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}

/**
 * When the user usually works: the median first start and last end over active days, snapped to
 * half hours. Falls back to 09:00–19:00 until there is enough history.
 */
export function inferWorkHours(entries: readonly TimeEntry[], now: Timestamp) {
  const byDay = new Map<LocalDate, { first: number; last: number }>()
  for (const e of entries) {
    if (e.deletedAt || e.end === null) continue
    const day = toLocalDate(e.start)
    const startMin = (e.start - startOfLocalDate(day)) / MIN
    const endMin = Math.min(24 * 60, ((e.end ?? now) - startOfLocalDate(day)) / MIN)
    const cur = byDay.get(day)
    byDay.set(day, {
      first: Math.min(cur?.first ?? Infinity, startMin),
      last: Math.max(cur?.last ?? 0, endMin),
    })
  }
  if (byDay.size < 3) return { start: '09:00', end: '19:00' }
  const days = [...byDay.values()]
  const start = Math.floor(median(days.map((d) => d.first)) / 30) * 30
  const end = Math.min(24 * 60 - 30, Math.ceil(median(days.map((d) => d.last)) / 30) * 30)
  const toTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  return end - start >= 4 * 60
    ? { start: toTime(start), end: toTime(end) }
    : { start: '09:00', end: '19:00' }
}

/**
 * Everything the mentor needs to know, in a few thousand tokens: what is due and planned, what
 * the calendar holds, when the user works, and how the last two weeks went (via the analytics
 * core). Pure — the same input gives the same context.
 */
export function buildContext(input: ContextInput): { context: MentorContext; refs: RefMap } {
  const { now, tasks, projects, blocks, entries, trackedTotals, goals = [] } = input
  const signals = goalSignals(goals, tasks, entries, now)
  const today = toLocalDate(now)
  const horizon = addDays(today, 7)
  const lastDay = addDays(today, AHEAD_DAYS - 1)
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const refs: RefMap = { task: new Map(), block: new Map() }

  const alive = tasks.filter((t) => !t.deletedAt && t.status === 'open')
  const upcoming = blocks.filter(
    (b) => !b.deletedAt && toLocalDate(b.start) >= today && toLocalDate(b.start) <= lastDay,
  )
  // Only blocks still ahead count: a task whose block has passed unfinished needs a new slot.
  const scheduled = new Set(
    upcoming.flatMap((b) => (b.taskId && b.end > now ? [b.taskId] : [])),
  )

  // Most relevant first: overdue and due soon, planned this week, then the rest by priority.
  const rank = (t: Task) =>
    (t.dueDate && t.dueDate <= horizon ? 0 : t.plannedDate && t.plannedDate <= horizon ? 1 : 2) *
      10 +
    (3 - t.priority)
  const chosen = alive
    .filter((t) => !t.parentId || (t.plannedDate && t.plannedDate <= horizon))
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') ||
        a.order - b.order,
    )
    .slice(0, MAX_TASKS)

  const tracked = (id: Id) => {
    const own = trackedTotals.get(id) ?? 0
    const children = alive
      .filter((t) => t.parentId === id)
      .reduce((s, t) => s + (trackedTotals.get(t.id) ?? 0), 0)
    return Math.round((own + children) / MIN)
  }
  const ctxTasks: ContextTask[] = chosen.map((t, i) => {
    const ref = `t${i + 1}`
    refs.task.set(ref, t.id)
    const owner = t.parentId ? byId.get(t.parentId) : t
    const project = owner?.projectId ? projectName.get(owner.projectId) : undefined
    return {
      ref,
      title: t.title,
      ...(project ? { project } : {}),
      priority: t.priority,
      ...(t.estimateMin ? { estimateMin: t.estimateMin } : {}),
      trackedMin: tracked(t.id),
      ...(t.plannedDate ? { plannedDate: t.plannedDate } : {}),
      ...(t.dueDate ? { dueDate: t.dueDate } : {}),
      scheduled: scheduled.has(t.id),
      ...(t.parentId && byId.get(t.parentId) ? { parent: byId.get(t.parentId)!.title } : {}),
    }
  })
  const taskRef = new Map([...refs.task].map(([ref, id]) => [id, ref]))

  const ctxBlocks: ContextBlock[] = upcoming
    .sort((a, b) => a.start - b.start)
    .map((b, i) => {
      const ref = `b${i + 1}`
      refs.block.set(ref, b.id)
      const tRef = b.taskId ? taskRef.get(b.taskId) : undefined
      return {
        ref,
        date: toLocalDate(b.start),
        start: clock(b.start),
        // A block that runs past midnight ends at the end of its day for the model.
        end: toLocalDate(b.end - 1) === toLocalDate(b.start) ? clock(b.end) : '23:59',
        title: (b.taskId ? byId.get(b.taskId)?.title : undefined) ?? b.title ?? '',
        kind: b.kind,
        ...(tRef ? { taskRef: tRef } : {}),
      }
    })

  const dayStart = startOfLocalDate(today)
  const trackedToday = entries
    .filter((e) => !e.deletedAt && (e.end ?? now) > dayStart)
    .sort((a, b) => a.start - b.start)
    .map((e) => ({
      start: clock(Math.max(e.start, dayStart)),
      end: e.end === null ? 'now' : clock(e.end),
      title: (e.taskId ? byId.get(e.taskId)?.title : undefined) ?? e.note ?? '—',
    }))

  // The last two weeks, today excluded (it is not over yet).
  const report = buildReport({
    period: customPeriod(addDays(today, -HISTORY_DAYS), addDays(today, -1)),
    now,
    entries,
    blocks,
    tasks,
    trackedTotals,
  })
  let peak = { day: 0, hour: 0, ms: 0 }
  report.heat.forEach((row, day) =>
    row.forEach((ms, hour) => {
      const pair = ms + (row[hour + 1] ?? 0)
      if (pair > peak.ms) peak = { day, hour, ms: pair }
    }),
  )
  const round2 = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100)

  const d = new Date(now)
  return {
    refs,
    context: {
      now: `${today}T${clock(now)}`,
      weekday: WEEKDAYS[(d.getDay() + 6) % 7]!,
      today,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workHours: inferWorkHours(entries, now),
      tasks: ctxTasks,
      blocks: ctxBlocks,
      trackedToday,
      history: {
        days: HISTORY_DAYS,
        avgTrackedMin: Math.round(report.trackedMs / HISTORY_DAYS / MIN),
        activeDays: report.activeDays,
        planCompletion: round2(report.plan.completion),
        estimateRatio: round2(report.estimates.medianRatio),
        peak:
          peak.ms > 0
            ? `${WEEKDAYS[peak.day]!.slice(0, 3)} ${pad(peak.hour)}:00–${pad(peak.hour + 2)}:00`
            : null,
        projects: report.projects
          .filter((p) => p.projectId)
          .slice(0, 6)
          .map((p) => ({
            name: projectName.get(p.projectId!) ?? '—',
            minutes: Math.round(p.ms / MIN),
          })),
      },
      ...(signals.length ? { goals: signals } : {}),
    },
  }
}

/** The light picture of the user the intake needs: rhythm and existing goals, no task lists. */
export function aboutUser(context: MentorContext, goals: readonly string[]): IntakeAbout {
  return {
    today: context.today,
    weekday: context.weekday,
    workHours: context.workHours,
    avgTrackedMin: context.history.avgTrackedMin,
    activeDays: context.history.activeDays,
    goals: [...goals],
  }
}
