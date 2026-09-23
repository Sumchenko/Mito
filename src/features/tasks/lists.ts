import { addDays, type Id, type LocalDate, type Task } from '@/data'

/** Built-in smart lists plus one list per project. */
export type ListId = 'inbox' | 'today' | 'upcoming' | 'all' | `project:${string}`

export const SMART_LISTS = ['inbox', 'today', 'upcoming', 'all'] as const

export const projectList = (id: Id): ListId => `project:${id}`
export const projectIdOf = (list: ListId): Id | undefined =>
  list.startsWith('project:') ? list.slice('project:'.length) : undefined

export function isListId(value: string | undefined): value is ListId {
  return (
    !!value &&
    ((SMART_LISTS as readonly string[]).includes(value) || /^project:.+/.test(value))
  )
}

const UPCOMING_DAYS = 7

export interface ListView {
  open: Task[]
  done: Task[]
  /** Upcoming only: open tasks grouped by the day they are planned (or due). */
  groups?: { day: LocalDate; tasks: Task[] }[]
}

const isOpen = (t: Task) => t.status === 'open'
const byOrder = (a: Task, b: Task) => a.order - b.order

/** The day an upcoming task belongs to: when it is planned, else when it is due. */
const upcomingDay = (t: Task) => t.plannedDate ?? t.dueDate

export function isOverdue(t: Task, today: LocalDate) {
  return isOpen(t) && ((t.dueDate !== undefined && t.dueDate < today) ||
    (t.plannedDate !== undefined && t.plannedDate < today))
}

/** A subtask whose parent is listed too is shown inline under it, not as a second row. */
function withoutNestedDuplicates(tasks: Task[]) {
  const listed = new Set(tasks.map((t) => t.id))
  return tasks.filter((t) => !t.parentId || !listed.has(t.parentId))
}

/**
 * Which tasks a list shows. Project and inbox lists show top-level tasks (subtasks live under
 * their parent); date lists also show subtasks planned on their own, because the plan is
 * about that specific piece of work.
 */
export function selectList(tasks: Task[], list: ListId, today: LocalDate): ListView {
  const live = tasks.filter((t) => t.status !== 'cancelled')
  const projectId = projectIdOf(list)

  let picked: Task[]
  switch (list) {
    case 'inbox':
      picked = live.filter((t) => !t.projectId && !t.parentId)
      break
    case 'all':
      picked = live.filter((t) => !t.parentId)
      break
    case 'today':
      // Today's plan plus anything planned earlier that is still open (carried over).
      picked = live.filter(
        (t) =>
          t.plannedDate !== undefined &&
          (t.plannedDate === today || (t.plannedDate < today && isOpen(t))),
      )
      break
    case 'upcoming': {
      const until = addDays(today, UPCOMING_DAYS)
      picked = withoutNestedDuplicates(
        live.filter((t) => {
          const day = upcomingDay(t)
          return isOpen(t) && day !== undefined && day > today && day <= until
        }),
      )
      const groups = new Map<LocalDate, Task[]>()
      for (const t of picked.sort(byOrder)) {
        const day = upcomingDay(t)!
        groups.set(day, [...(groups.get(day) ?? []), t])
      }
      return {
        open: picked,
        done: [],
        groups: [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, tasks]) => ({ day, tasks })),
      }
    }
    default:
      picked = live.filter((t) => t.projectId === projectId && !t.parentId)
  }

  picked = withoutNestedDuplicates(picked)

  return {
    open: picked.filter(isOpen).sort(byOrder),
    // Most recently completed first.
    done: picked
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
  }
}

/** Open-task counts for the lists pane. */
export function countLists(tasks: Task[], projectIds: Id[], today: LocalDate) {
  const counts: Record<string, number> = {}
  for (const list of [...SMART_LISTS, ...projectIds.map(projectList)]) {
    counts[list] = selectList(tasks, list, today).open.length
  }
  return counts
}

/** done/total per parent id, for "2/3" badges. */
export function subtaskProgress(tasks: Task[]) {
  const progress = new Map<Id, { done: number; total: number }>()
  for (const t of tasks) {
    if (!t.parentId || t.status === 'cancelled') continue
    const p = progress.get(t.parentId) ?? { done: 0, total: 0 }
    p.total += 1
    if (t.status === 'done') p.done += 1
    progress.set(t.parentId, p)
  }
  return progress
}

/**
 * `order` for an item dropped between two neighbours. Orders are sparse floats, so a midpoint
 * almost always exists; the caller renumbers only in the rare case it does not.
 */
export function orderBetween(before: number | undefined, after: number | undefined) {
  if (before === undefined && after === undefined) return 0
  if (before === undefined) return after! - 1024
  if (after === undefined) return before + 1024
  return (before + after) / 2
}
