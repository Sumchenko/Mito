import {
  addDays,
  startOfLocalDate,
  toLocalDate,
  type Goal,
  type GoalStage,
  type LocalDate,
  type Task,
  type TimeEntry,
  type Timestamp,
} from '@/data'

const MIN = 60_000
const DAY = 86_400_000

export interface StageProgress extends GoalStage {
  /** Top-level tasks of the stage, open first by planned day, then the done ones. */
  tasks: Task[]
  done: number
  total: number
}

export interface GoalProgress {
  stages: StageProgress[]
  /** Index of the active stage; -1 when every stage is done. */
  current: number
  /** The next open task of the active stage, by planned day. */
  next?: Task
  /** Minutes tracked on the goal this week (Monday on) and in total. */
  weekMinutes: number
  totalMinutes: number
  /** The last weeks, oldest first, the current one last. */
  weeks: { start: LocalDate; minutes: number }[]
  /** Whole days until the deadline (negative once it has passed). */
  daysLeft?: number
}

/** Monday of the week that holds `day`. */
export function weekStart(day: LocalDate): LocalDate {
  const weekday = (new Date(startOfLocalDate(day)).getDay() + 6) % 7
  return addDays(day, -weekday)
}

const byPlan = (a: Task, b: Task) =>
  (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') || a.order - b.order

/**
 * Where a learning goal stands: its stages with their tasks, the time put in per week against
 * the plan, the next step and the deadline. Pure: the goal page and the mentor share it.
 */
export function goalProgress(
  goal: Goal,
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  now: Timestamp,
  weeksBack = 6,
): GoalProgress {
  const own = tasks.filter((t) => t.goalId === goal.id && !t.deletedAt && t.status !== 'cancelled')
  const ids = new Set(own.map((t) => t.id))
  const stages = goal.stages.map((stage): StageProgress => {
    // Tasks without a stage belong to the first one: nothing gets lost from the path.
    const list = own.filter((t) => !t.parentId && (t.stageId ?? goal.stages[0]?.id) === stage.id)
    const open = list.filter((t) => t.status === 'open').sort(byPlan)
    const closed = list
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    return { ...stage, tasks: [...open, ...closed], done: closed.length, total: list.length }
  })
  const current = stages.findIndex((s) => s.status === 'active')

  const today = toLocalDate(now)
  const thisWeek = weekStart(today)
  const first = addDays(thisWeek, -7 * (weeksBack - 1))
  const weeks = Array.from({ length: weeksBack }, (_, i) => ({
    start: addDays(first, 7 * i),
    minutes: 0,
  }))
  let total = 0
  const from = startOfLocalDate(first)
  for (const e of entries) {
    if (e.deletedAt || !e.taskId || !ids.has(e.taskId)) continue
    const end = e.end ?? now
    total += end - e.start
    if (end <= from) continue
    // Credit each week with its own part of the entry (a session can cross midnight on Sunday).
    for (const w of weeks) {
      const ws = startOfLocalDate(w.start)
      const we = ws + 7 * DAY
      const part = Math.min(end, we) - Math.max(e.start, ws)
      if (part > 0) w.minutes += part
    }
  }
  for (const w of weeks) w.minutes = Math.round(w.minutes / MIN)

  return {
    stages,
    current,
    next: current >= 0 ? stages[current]!.tasks.find((t) => t.status === 'open') : undefined,
    weekMinutes: weeks[weeks.length - 1]!.minutes,
    totalMinutes: Math.round(total / MIN),
    weeks,
    ...(goal.targetDate
      ? {
          daysLeft: Math.round(
            (startOfLocalDate(goal.targetDate) - startOfLocalDate(today)) / DAY,
          ),
        }
      : {}),
  }
}
