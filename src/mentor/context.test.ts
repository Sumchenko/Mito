import { describe, expect, it } from 'vitest'
import type { Project, Task, TimeBlock, TimeEntry } from '@/data'
import { buildContext, inferWorkHours } from './context'
import { contextRefs } from './protocol'

const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, h, m).getTime()
}
const meta = { createdAt: 0, updatedAt: 0 }
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  ...meta,
  title: id,
  tagIds: [],
  status: 'open',
  priority: 0,
  order: 0,
  ...extra,
})
const entry = (id: string, start: number, end: number, taskId?: string): TimeEntry => ({
  id,
  ...meta,
  start,
  end,
  source: 'timer',
  ...(taskId ? { taskId } : {}),
})
const now = at('2026-09-27', 10, 5)

describe('inferWorkHours', () => {
  it('uses the median first start and last end of active days', () => {
    const entries = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'].flatMap((d, i) => [
      entry(`a${i}`, at(d, 9, 10 * i), at(d, 11)),
      entry(`b${i}`, at(d, 14), at(d, 18, 20)),
    ])
    expect(inferWorkHours(entries, now)).toEqual({ start: '09:00', end: '18:30' })
  })

  it('falls back to a normal day without history', () => {
    expect(inferWorkHours([], now)).toEqual({ start: '09:00', end: '19:00' })
  })
})

describe('buildContext', () => {
  const projects: Project[] = [{ id: 'p', ...meta, name: 'Work', color: 'blue', order: 0 }]
  const tasks = [
    task('someday', { priority: 3 }),
    task('due', { dueDate: '2026-09-28', projectId: 'p', estimateMin: 90 }),
    task('done', { status: 'done' }),
    task('sub', { parentId: 'due', plannedDate: '2026-09-27' }),
  ]
  const blocks: TimeBlock[] = [
    {
      id: 'blk',
      ...meta,
      taskId: 'due',
      start: at('2026-09-27', 12),
      end: at('2026-09-27', 13),
      kind: 'task',
      origin: 'user',
    },
    {
      id: 'old',
      ...meta,
      title: 'Past',
      start: at('2026-09-20', 12),
      end: at('2026-09-20', 13),
      kind: 'event',
      origin: 'user',
    },
  ]
  const { context, refs } = buildContext({
    now,
    tasks,
    projects,
    blocks,
    entries: [entry('e', at('2026-09-27', 9), at('2026-09-27', 9, 45), 'due')],
    trackedTotals: new Map([
      ['due', 30 * 60_000],
      ['sub', 15 * 60_000],
    ]),
  })

  it('lists open tasks, most urgent first, with refs instead of ids', () => {
    expect(context.tasks.map((t) => t.title)).toEqual(['due', 'sub', 'someday'])
    expect(context.tasks[0]).toMatchObject({
      ref: 't1',
      project: 'Work',
      estimateMin: 90,
      trackedMin: 45,
      scheduled: true,
    })
    expect(context.tasks[1]).toMatchObject({ parent: 'due' })
    expect(refs.task.get('t1')).toBe('due')
    expect(JSON.stringify(context)).not.toContain('"id"')
  })

  it('shows the calendar from today on, linked to task refs', () => {
    expect(context.blocks).toEqual([
      {
        ref: 'b1',
        date: '2026-09-27',
        start: '12:00',
        end: '13:00',
        title: 'due',
        kind: 'task',
        taskRef: 't1',
      },
    ])
    expect(refs.block.get('b1')).toBe('blk')
    expect(contextRefs(context).has('b1')).toBe(true)
  })

  it('does not count a block that has already passed as scheduled', () => {
    const later = buildContext({
      now: at('2026-09-27', 18),
      tasks,
      projects,
      blocks,
      entries: [],
      trackedTotals: new Map(),
    })
    expect(later.context.tasks.find((t) => t.title === 'due')?.scheduled).toBe(false)
  })

  it('includes today and the local time', () => {
    expect(context).toMatchObject({
      today: '2026-09-27',
      now: '2026-09-27T10:05',
      weekday: 'Sunday',
    })
    expect(context.trackedToday).toEqual([{ start: '09:00', end: '09:45', title: 'due' }])
  })
})
