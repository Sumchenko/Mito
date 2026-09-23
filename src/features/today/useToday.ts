import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import {
  dayRange,
  tasksRepo,
  toLocalDate,
  useNow,
  useProjects,
  useTasksPlannedFor,
  useTimeBlocks,
  useTimeEntries,
  type Id,
  type Project,
  type Task,
} from '@/data'

const clip = (start: number, end: number, from: number, to: number) =>
  Math.max(0, Math.min(end, to) - Math.max(start, from))

/** Everything the Today dashboard shows, derived live from the data layer. */
export function useToday() {
  const now = useNow(15_000)
  const day = toLocalDate(now)
  const [from, to] = useMemo(() => dayRange(day), [day])

  const planned = useTasksPlannedFor(day)
  const entries = useTimeEntries(from, to)
  const blocks = useTimeBlocks(from, to)
  const projects = useProjects(true)

  // Tasks referenced by blocks may not be planned for today — fetch them by id.
  const blockTaskIds = useMemo(
    () => [...new Set((blocks ?? []).flatMap((b) => (b.taskId ? [b.taskId] : [])))],
    [blocks],
  )
  const blockTasks = useLiveQuery(
    () => Promise.all(blockTaskIds.map((id) => tasksRepo.get(id))),
    [blockTaskIds.join()],
  )

  return useMemo(() => {
    const projectById = new Map<Id, Project>((projects ?? []).map((p) => [p.id, p]))
    const taskById = new Map<Id, Task>()
    for (const task of [...(planned ?? []), ...(blockTasks ?? [])]) if (task) taskById.set(task.id, task)

    const focusTasks = (planned ?? []).filter((t) => !t.parentId && t.status !== 'cancelled')
    const trackedMs = (entries ?? []).reduce(
      (sum, e) => sum + clip(e.start, e.end ?? now, from, to),
      0,
    )
    const plannedMs = (blocks ?? [])
      .filter((b) => b.kind === 'task')
      .reduce((sum, b) => sum + clip(b.start, b.end, from, to), 0)

    return {
      loading: planned === undefined || entries === undefined || blocks === undefined,
      now,
      focusTasks,
      doneCount: focusTasks.filter((t) => t.status === 'done').length,
      trackedMs,
      sessions: entries?.length ?? 0,
      planRatio: plannedMs > 0 ? Math.min(1, trackedMs / plannedMs) : 0,
      blocks: blocks ?? [],
      dayStart: from,
      projectById,
      taskById,
    }
  }, [now, from, to, planned, entries, blocks, projects, blockTasks])
}
