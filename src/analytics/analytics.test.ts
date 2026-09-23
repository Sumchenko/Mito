import { describe, expect, it } from 'vitest'
import type { LocalDate, Task, TimeBlock, TimeEntry } from '@/data'
import { forEachHour, overlap, union } from './intervals'
import { bucketOf, customPeriod, elapsedDays, periodLength, periodOf, shiftPeriod } from './period'
import { buildReport, dailyTracked, streaks } from './report'

const at = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(y, mo - 1, d, h, m).getTime()
}
const H = 3_600_000
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
const entry = (id: string, start: number, end: number | null, extra: Partial<TimeEntry> = {}): TimeEntry => ({
  id,
  ...meta,
  start,
  end,
  source: 'timer',
  ...extra,
})
const block = (id: string, taskId: string, start: number, end: number): TimeBlock => ({
  id,
  ...meta,
  taskId,
  start,
  end,
  kind: 'task',
  origin: 'user',
})

describe('periods', () => {
  it('builds weeks from Monday, months and years', () => {
    expect(periodOf('week', '2026-09-23')).toMatchObject({ from: '2026-09-21', to: '2026-09-27' })
    expect(periodOf('week', '2026-09-27')).toMatchObject({ from: '2026-09-21', to: '2026-09-27' })
    expect(periodOf('month', '2026-02-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodOf('year', '2026-09-23')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' })
  })

  it('shifts periods by their own unit', () => {
    expect(shiftPeriod(periodOf('month', '2026-01-31'), 1)).toMatchObject({ from: '2026-02-01', to: '2026-02-28' })
    expect(shiftPeriod(periodOf('week', '2026-01-01'), -1)).toMatchObject({ from: '2025-12-22', to: '2025-12-28' })
    const custom = customPeriod('2026-09-10', '2026-09-01')
    expect(custom).toMatchObject({ from: '2026-09-01', to: '2026-09-10' })
    expect(shiftPeriod(custom, -1)).toMatchObject({ from: '2026-08-22', to: '2026-08-31' })
  })

  it('counts length, elapsed days and chart buckets', () => {
    const week = periodOf('week', '2026-09-23')
    expect(periodLength(week)).toBe(7)
    expect(elapsedDays(week, '2026-09-23')).toBe(3)
    expect(elapsedDays(week, '2026-10-30')).toBe(7)
    expect(elapsedDays(week, '2026-09-01')).toBe(0)
    expect(bucketOf(week)).toBe('day')
    expect(bucketOf(periodOf('year', '2026-01-01'))).toBe('month')
    expect(bucketOf(customPeriod('2026-01-01', '2026-04-01'))).toBe('week')
  })
})

describe('intervals', () => {
  it('merges and intersects', () => {
    const a = union([
      [5, 8],
      [0, 3],
      [2, 4],
    ])
    expect(a).toEqual([
      [0, 4],
      [5, 8],
    ])
    expect(overlap(a, union([[3, 6]]))).toBe(2)
  })

  it('walks clock hours', () => {
    const pieces: number[] = []
    forEachHour(at('2026-09-21', 9, 40), at('2026-09-21', 11, 10), (_, ms) => pieces.push(ms / 60_000))
    expect(pieces).toEqual([20, 60, 10])
  })
})

describe('buildReport', () => {
  const period = periodOf('week', '2026-09-21')
  const now = at('2026-09-30', 12)
  const tasks = [
    task('api', { projectId: 'work', tagIds: ['deep'] }),
    task('api-tests', { parentId: 'api' }),
    task('read', { projectId: 'study' }),
  ]

  it('splits tracked time over days, hours and projects; subtasks count for the parent', () => {
    const r = buildReport({
      period,
      now,
      tasks,
      blocks: [],
      entries: [
        entry('e1', at('2026-09-21', 23), at('2026-09-22', 1), { taskId: 'api-tests' }),
        entry('e2', at('2026-09-22', 10), at('2026-09-22', 10, 30), { taskId: 'read', source: 'pomodoro' }),
        entry('e3', at('2026-09-23', 9), at('2026-09-23', 9, 20)),
        // Outside the week: ignored.
        entry('e4', at('2026-09-29', 9), at('2026-09-29', 10), { taskId: 'read' }),
      ],
    })
    expect(r.trackedMs).toBe(2 * H + 50 * 60_000)
    expect(r.sessions).toBe(3)
    expect(r.pomodoros).toBe(1)
    expect(r.noTaskMs).toBe(20 * 60_000)
    expect(r.byDay.get('2026-09-21')!.trackedMs).toBe(H)
    expect(r.byDay.get('2026-09-22')!.trackedMs).toBe(1.5 * H)
    expect(r.projects[0]).toEqual({ projectId: 'work', ms: 2 * H, tasks: [{ taskId: 'api', ms: 2 * H }] })
    expect(r.tags).toEqual([{ tagId: 'deep', ms: 2 * H }])
    expect(r.heat[0]![23]).toBe(H) // Monday 23:00
    expect(r.heat[1]![0]).toBe(H) // Tuesday 00:00
    expect(r.activeDays).toBe(3)
    expect(r.avgPerDayMs).toBe(r.trackedMs / 7)
  })

  it('separates doing the plan from doing it on time', () => {
    const r = buildReport({
      period,
      now,
      tasks,
      entries: [
        // Planned 10–12 for api; worked 11–12 on time and 15–16 later the same day.
        entry('e1', at('2026-09-22', 11), at('2026-09-22', 12), { taskId: 'api' }),
        entry('e2', at('2026-09-22', 15), at('2026-09-22', 16), { taskId: 'api-tests' }),
        // Unplanned work.
        entry('e3', at('2026-09-22', 17), at('2026-09-22', 18), { taskId: 'read' }),
      ],
      blocks: [
        block('b1', 'api', at('2026-09-22', 10), at('2026-09-22', 12)),
        // Overlapping block of the same task is not double-counted.
        block('b2', 'api', at('2026-09-22', 11), at('2026-09-22', 12)),
      ],
    })
    expect(r.plan.plannedMs).toBe(2 * H)
    expect(r.plan.doneMs).toBe(2 * H)
    expect(r.plan.onTimeMs).toBe(H)
    expect(r.plan.completion).toBe(1)
    expect(r.plan.accuracy).toBe(0.5)
    expect(r.plan.unplannedMs).toBe(H)
  })

  it('compares estimates with all-time tracked time of finished tasks', () => {
    const done = { status: 'done' as const, completedAt: at('2026-09-23', 12) }
    const r = buildReport({
      period,
      now,
      entries: [],
      blocks: [],
      tasks: [
        task('a', { ...done, estimateMin: 60 }),
        task('a1', { parentId: 'a' }),
        task('b', { ...done, estimateMin: 60 }),
        task('c', { ...done, estimateMin: 30, completedAt: at('2026-08-01', 12) }),
      ],
      trackedTotals: new Map([
        ['a', 60 * 60_000],
        ['a1', 60 * 60_000],
        ['b', 55 * 60_000],
        ['c', 30 * 60_000],
      ]),
    })
    expect(r.tasksDone).toBe(2)
    expect(r.estimates.items.map((x) => x.taskId)).toEqual(['a', 'b'])
    expect(r.estimates.items[0]!.ratio).toBe(2)
    expect(r.estimates.accurateShare).toBe(0.5)
  })
})

describe('streaks', () => {
  const days = (list: string[]) => new Map(list.map((d) => [d as LocalDate, 3_600_000]))

  it('keeps the current streak alive until today ends', () => {
    const map = days(['2026-09-20', '2026-09-21', '2026-09-22'])
    expect(streaks(map, '2026-09-23')).toEqual({ current: 3, longest: 3 })
    expect(streaks(map, '2026-09-24').current).toBe(0)
  })

  it('finds the longest run', () => {
    const map = days(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'])
    expect(streaks(map, '2026-09-10')).toEqual({ current: 1, longest: 3 })
  })
})

describe('dailyTracked', () => {
  it('splits entries at midnight', () => {
    const map = dailyTracked(
      [entry('e', at('2026-09-21', 23), at('2026-09-22', 2))],
      at('2026-09-01', 0),
      at('2026-10-01', 0),
      0,
    )
    expect([...map]).toEqual([
      ['2026-09-21', 3_600_000],
      ['2026-09-22', 7_200_000],
    ])
  })
})
