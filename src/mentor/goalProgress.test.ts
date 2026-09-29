import { describe, expect, it } from 'vitest'
import type { Goal, Task, TimeEntry } from '@/data'
import { goalProgress, weekStart } from './goalProgress'

const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, h, m).getTime()
}
const meta = { createdAt: 0, updatedAt: 0 }
const goal: Goal = {
  id: 'g',
  ...meta,
  title: 'Python',
  status: 'active',
  profile: { subject: 'Python' },
  stages: [
    { id: 's1', title: 'Basics', outcome: 'Scripts', status: 'done' },
    { id: 's2', title: 'pandas', outcome: 'CSV', status: 'active' },
    { id: 's3', title: 'Project', outcome: 'Repo', status: 'upcoming' },
  ],
  targetDate: '2026-10-11',
  weeklyMinutes: 300,
  order: 0,
}
const task = (id: string, extra: Partial<Task>): Task => ({
  id,
  ...meta,
  title: id,
  tagIds: [],
  status: 'open',
  priority: 0,
  order: 0,
  goalId: 'g',
  ...extra,
})
const tasks: Task[] = [
  task('old', { stageId: 's1', status: 'done', completedAt: 5 }),
  task('later', { stageId: 's2', plannedDate: '2026-10-01' }),
  task('soon', { stageId: 's2', plannedDate: '2026-09-29' }),
  task('finished', { stageId: 's2', status: 'done', completedAt: 9 }),
  task('dropped', { stageId: 's2', status: 'cancelled' }),
  task('loose', {}),
  task('other', { goalId: 'x', stageId: 's2' }),
]
const entry = (id: string, taskId: string, start: number, end: number | null): TimeEntry => ({
  id,
  ...meta,
  taskId,
  start,
  end,
  source: 'timer',
})
const now = at('2026-09-30', 20) // a Wednesday

describe('goalProgress', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-09-30')).toBe('2026-09-28')
    expect(weekStart('2026-09-28')).toBe('2026-09-28')
    expect(weekStart('2026-10-04')).toBe('2026-09-28')
  })

  it('groups tasks by stage, open first by planned day', () => {
    const p = goalProgress(goal, tasks, [], now)
    expect(p.current).toBe(1)
    expect(p.stages[0]!.tasks.map((t) => t.id)).toEqual(['loose', 'old'])
    expect(p.stages[1]).toMatchObject({ done: 1, total: 3 })
    expect(p.stages[1]!.tasks.map((t) => t.id)).toEqual(['soon', 'later', 'finished'])
    expect(p.next?.id).toBe('soon')
    expect(p.daysLeft).toBe(11)
  })

  it('counts the goal time per week, splitting sessions across weeks', () => {
    const p = goalProgress(
      goal,
      tasks,
      [
        entry('a', 'soon', at('2026-09-29', 19), at('2026-09-29', 20)),
        entry('b', 'finished', at('2026-09-27', 23, 30), at('2026-09-28', 0, 30)),
        entry('c', 'other', at('2026-09-29', 10), at('2026-09-29', 12)),
        entry('d', 'later', at('2026-09-30', 19, 30), null),
      ],
      now,
    )
    expect(p.weekMinutes).toBe(60 + 30 + 30)
    expect(p.weeks.at(-2)?.minutes).toBe(30)
    expect(p.totalMinutes).toBe(150)
    expect(p.weeks).toHaveLength(6)
  })
})
