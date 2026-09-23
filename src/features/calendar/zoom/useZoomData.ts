import { useMemo } from 'react'
import {
  startOfLocalDate,
  toLocalDate,
  useAllTasks,
  useNow,
  useProjects,
  useTimeBlocks,
  useTimeEntries,
  type Id,
  type LocalDate,
  type Task,
  type TimeBlock,
  type TimeEntry,
} from '@/data'
import { kindTint } from '../colors'
import { dayPart } from '../geometry'
import { cellToDay } from './camera'

/** Rows are fetched in chunks so panning does not re-query the database every frame. */
const CHUNK = 8

export interface DayStats {
  /** Planned minutes per color, for the load bar. */
  planned: { tint: string; minutes: number }[]
  plannedMin: number
  trackedMin: number
  /** Titles of the day's blocks, earliest first, for summary tiles. */
  titles: { title: string; tint: string }[]
}

export interface DayItems {
  blocks: { block: TimeBlock; startMin: number; endMin: number; tint: string; title: string }[]
  entries: { entry: TimeEntry; startMin: number; endMin: number; tint: string }[]
}

export function useZoomData(rowFrom: number, rowTo: number, fallbackTitle: string) {
  const r0 = Math.floor(rowFrom / CHUNK) * CHUNK - CHUNK
  const r1 = Math.ceil(rowTo / CHUNK) * CHUNK + CHUNK
  const from = startOfLocalDate(cellToDay(r0, 0))
  const to = startOfLocalDate(cellToDay(r1, 0))

  const blocks = useTimeBlocks(from, to)
  const entries = useTimeEntries(from, to)
  const tasks = useAllTasks()
  const projects = useProjects(true)
  const now = useNow(60_000)

  return useMemo(() => {
    const taskById = new Map<Id, Task>((tasks ?? []).map((t) => [t.id, t]))
    const projectById = new Map((projects ?? []).map((p) => [p.id, p]))
    const tintOfTask = (taskId?: Id) => {
      const task = taskId ? taskById.get(taskId) : undefined
      const owner = task?.parentId ? taskById.get(task.parentId) : task
      const project = owner?.projectId ? projectById.get(owner.projectId) : undefined
      return project ? `var(--tint-${project.color})` : undefined
    }

    const items = new Map<LocalDate, DayItems>()
    const itemsOf = (day: LocalDate) => {
      let it = items.get(day)
      if (!it) items.set(day, (it = { blocks: [], entries: [] }))
      return it
    }

    // Split every interval over the days it touches (midnight-crossing items appear twice).
    const eachDay = (start: number, end: number, fn: (day: LocalDate, part: { startMin: number; endMin: number }) => void) => {
      for (let day = toLocalDate(start); startOfLocalDate(day) < end; ) {
        const part = dayPart(start, end, day)
        if (part) fn(day, part)
        const next = new Date(startOfLocalDate(day))
        next.setDate(next.getDate() + 1)
        day = toLocalDate(next)
      }
    }

    for (const block of blocks ?? []) {
      const tint = block.kind === 'task' ? (tintOfTask(block.taskId) ?? kindTint('task')) : kindTint(block.kind)
      const title = (block.taskId ? taskById.get(block.taskId)?.title : undefined) ?? block.title ?? fallbackTitle
      eachDay(block.start, block.end, (day, part) => itemsOf(day).blocks.push({ block, ...part, tint, title }))
    }
    for (const entry of entries ?? []) {
      const tint = tintOfTask(entry.taskId) ?? 'var(--text-tertiary)'
      eachDay(entry.start, entry.end ?? now, (day, part) => itemsOf(day).entries.push({ entry, ...part, tint }))
    }

    const stats = new Map<LocalDate, DayStats>()
    for (const [day, it] of items) {
      const byTint = new Map<string, number>()
      let plannedMin = 0
      for (const b of it.blocks) {
        if (b.block.kind === 'break') continue
        const minutes = b.endMin - b.startMin
        plannedMin += minutes
        byTint.set(b.tint, (byTint.get(b.tint) ?? 0) + minutes)
      }
      stats.set(day, {
        planned: [...byTint].map(([tint, minutes]) => ({ tint, minutes })).sort((a, b) => b.minutes - a.minutes),
        plannedMin,
        trackedMin: it.entries.reduce((sum, e) => sum + (e.endMin - e.startMin), 0),
        titles: it.blocks
          .filter((b) => b.block.kind !== 'break')
          .sort((a, b) => a.startMin - b.startMin)
          .map((b) => ({ title: b.title, tint: b.tint })),
      })
    }
    return { items, stats, loading: !blocks || !entries }
  }, [blocks, entries, tasks, projects, now, fallbackTitle])
}

export type ZoomData = ReturnType<typeof useZoomData>
