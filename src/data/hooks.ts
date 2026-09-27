import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { dayRange } from './dates'
import { goalsRepo } from './repos/goals'
import { mentorNotesRepo } from './repos/mentorNotes'
import { projectsRepo } from './repos/projects'
import { tagsRepo } from './repos/tags'
import { tasksRepo } from './repos/tasks'
import { timeBlocksRepo } from './repos/timeBlocks'
import { timeEntriesRepo } from './repos/timeEntries'
import type { Id, LocalDate, Timestamp } from './types'

/*
 * Reactive reads for components. Each hook re-runs when the underlying tables change —
 * including changes made in another tab. `undefined` means "still loading".
 */

export const useProjects = (includeArchived = false) =>
  useLiveQuery(() => projectsRepo.list({ includeArchived }), [includeArchived])

export const useTags = () => useLiveQuery(() => tagsRepo.list(), [])

export const useAllTasks = () => useLiveQuery(() => tasksRepo.listAll(), [])

export const useTask = (id: Id | undefined) =>
  useLiveQuery(() => (id ? tasksRepo.get(id) : undefined), [id])

export const useTasksPlannedFor = (day: LocalDate) =>
  useLiveQuery(() => tasksRepo.listPlannedFor(day), [day])

export const useTasksByProject = (projectId: Id | null) =>
  useLiveQuery(() => tasksRepo.listByProject(projectId), [projectId])

export const useSubtasks = (parentId: Id) =>
  useLiveQuery(() => tasksRepo.listSubtasks(parentId), [parentId])

export const useGoals = () => useLiveQuery(() => goalsRepo.list(), [])

export const useGoal = (id: Id | undefined) =>
  useLiveQuery(() => (id ? goalsRepo.get(id) : undefined), [id])

/** Newest first; with a goal — its notes and the general ones. */
export const useMentorNotes = (goalId?: Id) =>
  useLiveQuery(() => mentorNotesRepo.list(goalId), [goalId])

/** The running entry: `undefined` while loading, `null` when nothing runs. */
export const useRunningEntry = () =>
  useLiveQuery(async () => (await timeEntriesRepo.running()) ?? null, [])

export const useTrackedTotals = () => useLiveQuery(() => timeEntriesRepo.totalsByTask(), [])

export const useTimeEntries = (from: Timestamp, to: Timestamp) =>
  useLiveQuery(() => timeEntriesRepo.inRange(from, to), [from, to])

export const useTimeEntriesOn = (day: LocalDate) => {
  const [from, to] = dayRange(day)
  return useTimeEntries(from, to)
}

/** Entries of a task and, when given, its subtasks. Keyed by the id list's content. */
export const useTaskEntries = (taskIds: Id[]) =>
  useLiveQuery(() => timeEntriesRepo.forTasks(taskIds), [taskIds.join()])

export const useTimeBlocks = (from: Timestamp, to: Timestamp) =>
  useLiveQuery(() => timeBlocksRepo.inRange(from, to), [from, to])

/** Current time, refreshed on an interval — for durations of running entries. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
