import { useMemo } from 'react'
import {
  toLocalDate,
  useAllTasks,
  useNow,
  useProjects,
  useTags,
  useTrackedTotals,
  type Id,
  type Project,
  type Tag,
  type Task,
} from '@/data'
import { subtaskProgress } from './lists'

/** One live snapshot of tasks, projects and tags with lookup maps, shared by the tasks UI. */
export function useTasksData() {
  const tasks = useAllTasks()
  const projects = useProjects()
  const allProjects = useProjects(true)
  const tags = useTags()
  const totals = useTrackedTotals()
  // Re-render around midnight so "today" rolls over without a reload.
  const today = toLocalDate(useNow(60_000))

  return useMemo(() => {
    const taskById = new Map<Id, Task>((tasks ?? []).map((t) => [t.id, t]))
    const projectById = new Map<Id, Project>((allProjects ?? []).map((p) => [p.id, p]))
    const tagById = new Map<Id, Tag>((tags ?? []).map((t) => [t.id, t]))
    const tracked = new Map<Id, number>(totals ?? [])
    for (const task of tasks ?? []) {
      const own = totals?.get(task.id)
      if (task.parentId && own) tracked.set(task.parentId, (tracked.get(task.parentId) ?? 0) + own)
    }
    return {
      loading: !tasks || !projects || !tags,
      tasks: tasks ?? [],
      projects: projects ?? [],
      tags: tags ?? [],
      taskById,
      projectById,
      tagById,
      progress: subtaskProgress(tasks ?? []),
      /** Finished tracked ms per task, subtasks rolled into parents. */
      tracked,
      today,
    }
  }, [tasks, projects, allProjects, tags, totals, today])
}

export type TasksData = ReturnType<typeof useTasksData>
