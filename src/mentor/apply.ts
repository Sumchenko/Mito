import { tasksRepo, timeBlocksRepo, type LocalDate, type Project } from '@/data'
import type { MentorAction, PlanBlock } from './protocol'
import type { RefMap } from './context'

/** "2026-09-27" + "14:30" → local epoch ms. */
export function atTime(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const [h, min] = time.split(':').map(Number) as [number, number]
  return new Date(y, m - 1, d, h, min).getTime()
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
      return tasksRepo.create({
        title: action.title,
        ...(project ? { projectId: project.id } : {}),
        ...(action.plannedDate ? { plannedDate: action.plannedDate as LocalDate } : {}),
        ...(action.dueDate ? { dueDate: action.dueDate as LocalDate } : {}),
        ...(action.estimateMin ? { estimateMin: action.estimateMin } : {}),
        ...(action.priority !== undefined ? { priority: action.priority as 0 | 1 | 2 | 3 } : {}),
      })
    }
    case 'schedule':
      return applyPlanBlock(
        { ...action, ...(action.title ? { kind: 'event' as const } : {}) },
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
