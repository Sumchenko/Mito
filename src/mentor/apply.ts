import { tasksRepo, timeBlocksRepo, type LocalDate, type Project } from '@/data'
import type { MentorAction, PlanBlock } from './protocol'
import type { RefMap } from './context'

/** "2026-09-27" + "14:30" → local epoch ms. */
export function atTime(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [h, min] = time.split(':').map(Number) as [number, number]
  return new Date(y, m - 1, d, h, min).getTime()
}

/** When an action happens: its day and start time, for showing proposals in time order. */
function actionWhen(a: MentorAction): string {
  switch (a.type) {
    case 'create_task':
      return a.start ? `${a.plannedDate}T${a.start}` : (a.plannedDate ?? a.dueDate ?? '')
    case 'schedule':
    case 'move_block':
      return `${a.date}T${a.start}`
    case 'plan_date':
      return a.date
  }
}

/**
 * Proposals in chronological order; undated ones (a task with no day) go last. A day without a
 * time sorts before that day's timed items. Stable, so the mentor's order breaks ties.
 */
export function inTimeOrder<T extends MentorAction>(actions: readonly T[]): T[] {
  return actions
    .map((action, i) => ({ action, i, when: actionWhen(action) || '￿' }))
    .sort((a, b) => a.when.localeCompare(b.when) || a.i - b.i)
    .map((x) => x.action)
}

/** Serialisable form of a ref map, kept with a chat message so its actions stay applicable. */
export type StoredRefs = { task: [string, string][]; block: [string, string][] }
export const storeRefs = (refs: RefMap): StoredRefs => ({
  task: [...refs.task],
  block: [...refs.block],
})
export const loadRefs = (s: StoredRefs): RefMap => ({
  task: new Map(s.task),
  block: new Map(s.block),
})

/**
 * Puts one proposed block on the calendar, marked as the mentor's. Everything goes through the
 * repositories, so validation, the task's planned date and sync all apply as for the user's own.
 */
export async function applyPlanBlock(block: PlanBlock, refs: RefMap) {
  const start = atTime(block.date, block.start)
  const end = atTime(block.date, block.end)
  const taskId = block.taskRef ? refs.task.get(block.taskRef) : undefined
  if (taskId) return timeBlocksRepo.create({ taskId, start, end, origin: 'mentor' })
  return timeBlocksRepo.create({
    title: block.title ?? '—',
    kind: block.kind ?? 'break',
    start,
    end,
    origin: 'mentor',
  })
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').trim()

/** Carries out a chat action the user confirmed. */
export async function applyAction(
  action: MentorAction,
  refs: RefMap,
  projects: readonly Project[],
) {
  switch (action.type) {
    case 'create_task': {
      // Only existing projects: the mentor must not invent structure.
      const project = action.project
        ? projects.find((p) => norm(p.name) === norm(action.project!))
        : undefined
      const task = await tasksRepo.create({
        title: action.title,
        ...(project ? { projectId: project.id } : {}),
        ...(action.plannedDate ? { plannedDate: action.plannedDate as LocalDate } : {}),
        ...(action.dueDate ? { dueDate: action.dueDate as LocalDate } : {}),
        ...(action.estimateMin ? { estimateMin: action.estimateMin } : {}),
        ...(action.priority !== undefined ? { priority: action.priority as 0 | 1 | 2 | 3 } : {}),
      })
      if (action.plannedDate && action.start && action.end)
        await timeBlocksRepo.create({
          taskId: task.id,
          start: atTime(action.plannedDate, action.start),
          end: atTime(action.plannedDate, action.end),
          origin: 'mentor',
        })
      return task
    }
    case 'schedule':
      // Older stored answers have no kind: a titled block from chat was an event then.
      return applyPlanBlock(
        { ...action, ...(action.title ? { kind: action.kind ?? 'event' } : {}) },
        refs,
      )
    case 'move_block': {
      const id = refs.block.get(action.blockRef)
      if (!id) throw new Error('unknown block')
      return timeBlocksRepo.update(id, {
        start: atTime(action.date, action.start),
        end: atTime(action.date, action.end),
      })
    }
    case 'plan_date': {
      const id = refs.task.get(action.taskRef)
      if (!id) throw new Error('unknown task')
      return tasksRepo.update(id, { plannedDate: action.date as LocalDate })
    }
  }
}
