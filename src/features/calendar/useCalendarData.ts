import { useMemo } from 'react'
import {
  addDays,
  startOfLocalDate,
  useAllTasks,
  useProjects,
  useTimeBlocks,
  useTimeEntries,
  type Id,
  type LocalDate,
  type Project,
  type Task,
  type TimeBlock,
  type TimeEntry,
} from '@/data'
import { kindTint } from './colors'

/** Plan (blocks) and fact (entries) for the visible days, plus lookups for labels and colors. */
export function useCalendarData(days: LocalDate[]) {
  const first = days[0]!
  const last = days[days.length - 1]!
  const from = startOfLocalDate(first)
  const to = startOfLocalDate(addDays(last, 1))

  const blocks = useTimeBlocks(from, to)
  const entries = useTimeEntries(from, to)
  const tasks = useAllTasks()
  const projects = useProjects(true)

  return useMemo(() => {
    const taskById = new Map<Id, Task>((tasks ?? []).map((t) => [t.id, t]))
    const projectById = new Map<Id, Project>((projects ?? []).map((p) => [p.id, p]))
    const projectOf = (task?: Task) => {
      const owner = task?.parentId ? taskById.get(task.parentId) : task
      return owner?.projectId ? projectById.get(owner.projectId) : undefined
    }
    return {
      blocks: blocks ?? [],
      entries: entries ?? [],
      tasks: tasks ?? [],
      taskById,
      projectOf,
      blockTint: (b: TimeBlock) => blockTint(b, b.taskId ? taskById.get(b.taskId) : undefined, projectOf),
      entryTint: (e: TimeEntry) => {
        const project = projectOf(e.taskId ? taskById.get(e.taskId) : undefined)
        return project ? `var(--tint-${project.color})` : 'var(--text-tertiary)'
      },
      blockTitle: (b: TimeBlock, fallback: string) =>
        (b.taskId ? taskById.get(b.taskId)?.title : undefined) ?? b.title ?? fallback,
    }
  }, [blocks, entries, tasks, projects])
}

export type CalendarData = ReturnType<typeof useCalendarData>

function blockTint(block: TimeBlock, task: Task | undefined, projectOf: (t?: Task) => Project | undefined) {
  if (block.kind !== 'task') return kindTint(block.kind)
  const project = projectOf(task)
  return project ? `var(--tint-${project.color})` : kindTint('task')
}
