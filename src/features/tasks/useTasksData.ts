import { useMemo } from 'react'
import {
  toLocalDate,
  useAllTasks,
  useNow,
  useProjects,
  useTags,
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
  // Re-render around midnight so "today" rolls over without a reload.
  const today = toLocalDate(useNow(60_000))

  return useMemo(() => {
    const taskById = new Map<Id, Task>((tasks ?? []).map((t) => [t.id, t]))
    const projectById = new Map<Id, Project>((allProjects ?? []).map((p) => [p.id, p]))
    const tagById = new Map<Id, Tag>((tags ?? []).map((t) => [t.id, t]))
    return {
      loading: !tasks || !projects || !tags,
      tasks: tasks ?? [],
      projects: projects ?? [],
      tags: tags ?? [],
      taskById,
      projectById,
      tagById,
      progress: subtaskProgress(tasks ?? []),
      today,
    }
  }, [tasks, projects, allProjects, tags, today])
}

export type TasksData = ReturnType<typeof useTasksData>
