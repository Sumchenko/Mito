import { describe, expect, it } from 'vitest'
import type { Task } from '@/data'
import { countLists, orderBetween, selectList, subtaskProgress } from './lists'

const today = '2026-09-23'
let n = 0
const task = (patch: Partial<Task>): Task => ({
  id: `t${++n}`,
  createdAt: 0,
  updatedAt: 0,
  title: `Task ${n}`,
  tagIds: [],
  status: 'open',
  priority: 0,
  order: n * 1024,
  ...patch,
})

describe('selectList', () => {
  const inbox = task({})
  const work = task({ projectId: 'p1' })
  const sub = task({ projectId: 'p1', parentId: work.id, plannedDate: today })
  const todayTask = task({ plannedDate: today })
  const carried = task({ plannedDate: '2026-09-20' })
  const carriedDone = task({ plannedDate: '2026-09-20', status: 'done', completedAt: 1 })
  const doneToday = task({ plannedDate: today, status: 'done', completedAt: 2 })
  const tomorrow = task({ plannedDate: '2026-09-24' })
  const dueSoon = task({ dueDate: '2026-09-26' })
  const farAway = task({ plannedDate: '2026-12-01' })
  const cancelled = task({ plannedDate: today, status: 'cancelled' })
  const all = [inbox, work, sub, todayTask, carried, carriedDone, doneToday, tomorrow, dueSoon, farAway, cancelled]
  const ids = (ts: Task[]) => ts.map((t) => t.id)

  it('inbox: top-level tasks without a project', () => {
    expect(ids(selectList(all, 'inbox', today).open)).not.toContain(work.id)
    expect(ids(selectList(all, 'inbox', today).open)).toContain(inbox.id)
  })

  it('today: planned today, carried-over open ones, subtasks included, cancelled excluded', () => {
    const view = selectList(all, 'today', today)
    expect(ids(view.open)).toEqual([sub.id, todayTask.id, carried.id].sort((a, b) =>
      all.find((t) => t.id === a)!.order - all.find((t) => t.id === b)!.order))
    expect(ids(view.done)).toEqual([doneToday.id])
  })

  it('does not list a subtask separately when its parent is listed too', () => {
    const parent = task({ plannedDate: today })
    const child = task({ parentId: parent.id, plannedDate: today })
    const view = selectList([parent, child], 'today', today)
    expect(ids(view.open)).toEqual([parent.id])
  })

  it('upcoming: next 7 days, grouped by planned-or-due day', () => {
    const view = selectList(all, 'upcoming', today)
    expect(view.groups?.map((g) => g.day)).toEqual(['2026-09-24', '2026-09-26'])
    expect(ids(view.open)).not.toContain(farAway.id)
  })

  it('project: top-level tasks of that project only', () => {
    expect(ids(selectList(all, 'project:p1', today).open)).toEqual([work.id])
  })

  it('counts open tasks per list', () => {
    const counts = countLists(all, ['p1'], today)
    expect(counts['project:p1']).toBe(1)
    expect(counts.today).toBe(3)
  })

  it('reports subtask progress', () => {
    expect(subtaskProgress(all).get(work.id)).toEqual({ done: 0, total: 1 })
  })
})

describe('orderBetween', () => {
  it('finds a value between neighbours, or past the ends', () => {
    expect(orderBetween(1024, 2048)).toBe(1536)
    expect(orderBetween(undefined, 1024)).toBe(0)
    expect(orderBetween(1024, undefined)).toBe(2048)
  })
})
