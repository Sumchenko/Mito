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
import { dayPart, layoutLanes } from '../geometry'
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
  /** Open tasks planned for the day without a block: "some time that day". */
  dated: { title: string; tint: string }[]
}

export interface DayItems {
  /** Plan blocks of the day with their side-by-side lane among overlapping blocks. */
  blocks: { block: TimeBlock; startMin: number; endMin: number; tint: string; title: string; lane: number; lanes: number }[]
  entries: { entry: TimeEntry; startMin: number; endMin: number; tint: string; title: string }[]
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
      eachDay(block.start, block.end, (day, part) =>
        itemsOf(day).blocks.push({ block, ...part, tint, title, lane: 0, lanes: 1 }),
      )
    }
    for (const entry of entries ?? []) {
      const tint = tintOfTask(entry.taskId) ?? 'var(--text-tertiary)'
      const title = (entry.taskId ? taskById.get(entry.taskId)?.title : undefined) ?? entry.note ?? fallbackTitle
      eachDay(entry.start, entry.end ?? now, (day, part) => itemsOf(day).entries.push({ entry, ...part, tint, title }))
    }

    for (const it of items.values()) {
      const lanes = layoutLanes(it.blocks.map((b) => ({ b, start: b.startMin, end: b.endMin })))
      for (const [{ b }, lane] of lanes) Object.assign(b, lane)
    }

    // Tasks planned for a day but not given time yet, shown on summary tiles.
    const scheduled = new Set((blocks ?? []).flatMap((b) => (b.taskId ? [b.taskId] : [])))
    const dated = new Map<LocalDate, DayStats['dated']>()
    for (const task of tasks ?? []) {
      if (task.status !== 'open' || !task.plannedDate || task.deletedAt || scheduled.has(task.id)) continue
      const list = dated.get(task.plannedDate) ?? []
      list.push({ title: task.title, tint: tintOfTask(task.id) ?? 'var(--text-tertiary)' })
      dated.set(task.plannedDate, list)
    }

    const stats = new Map<LocalDate, DayStats>()
    for (const day of new Set([...items.keys(), ...dated.keys()])) {
      const it = items.get(day) ?? { blocks: [], entries: [] }
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
        dated: dated.get(day) ?? [],
      })
    }
    const projectOf = (task?: Task) => {
      const owner = task?.parentId ? taskById.get(task.parentId) : task
      return owner?.projectId ? projectById.get(owner.projectId) : undefined
    }

    return {
      items,
      stats,
      loading: !blocks || !entries,
      // Lookups shared with block popovers and the unscheduled panel.
      blocks: blocks ?? [],
      entries: entries ?? [],
      tasks: tasks ?? [],
      taskById,
      projectOf,
      blockTint: (b: TimeBlock) =>
        b.kind === 'task' ? (tintOfTask(b.taskId) ?? kindTint('task')) : kindTint(b.kind),
      blockTitle: (b: TimeBlock, fallback: string) =>
        (b.taskId ? taskById.get(b.taskId)?.title : undefined) ?? b.title ?? fallback,
    }
  }, [blocks, entries, tasks, projects, now, fallbackTitle])
}

export type ZoomData = ReturnType<typeof useZoomData>

/** What block popovers and the side panel need to label and color things. */
export type CalendarLookup = Pick<ZoomData, 'blocks' | 'entries' | 'tasks' | 'taskById' | 'projectOf' | 'blockTint' | 'blockTitle'>
