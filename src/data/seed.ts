import { clearAllData } from './backup'
import { addDays, startOfLocalDate, toLocalDate } from './dates'
import { db } from './db'
import { created } from './meta'
import { projectsRepo } from './repos/projects'
import { tagsRepo } from './repos/tags'
import { tasksRepo } from './repos/tasks'
import { timeBlocksRepo } from './repos/timeBlocks'
import type { Task, TimeEntry } from './types'

const MIN = 60_000
const HOUR = 60 * MIN

/** Small deterministic PRNG so demo data looks the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/**
 * Development-only demo data: projects, tasks for today and the coming days, two weeks of
 * tracked history and today's plan. Replaces everything currently stored.
 */
export async function seedDemoData(now = Date.now()) {
  await clearAllData()
  const rand = rng(42)
  const today = toLocalDate(now)

  const work = await projectsRepo.create({ name: 'Работа', color: 'blue' })
  const study = await projectsRepo.create({ name: 'Учёба', color: 'violet' })
  const health = await projectsRepo.create({ name: 'Здоровье', color: 'green' })
  const growth = await projectsRepo.create({ name: 'Саморазвитие', color: 'orange' })
  const deep = await tagsRepo.create({ name: 'глубокая работа', color: 'teal' })
  await tagsRepo.create({ name: 'быстро', color: 'rose' })

  const t = (title: string, extra: Partial<Parameters<typeof tasksRepo.create>[0]> = {}) =>
    tasksRepo.create({ title, ...extra })

  const api = await t('Спроектировать API сервиса', {
    projectId: work.id,
    priority: 3,
    estimateMin: 150,
    plannedDate: today,
    dueDate: addDays(today, 3),
    tagIds: [deep.id],
  })
  await t('Описать эндпоинты', { parentId: api.id, estimateMin: 45 })
  await t('Схема базы данных', { parentId: api.id, estimateMin: 60 })
  const postgres = await t('Изучить индексы в Postgres', {
    projectId: study.id,
    priority: 2,
    estimateMin: 90,
    plannedDate: today,
  })
  const tests = await t('Написать тесты для сервиса', {
    projectId: work.id,
    priority: 2,
    estimateMin: 60,
    plannedDate: today,
  })
  const sport = await t('Тренировка', { projectId: health.id, estimateMin: 45, plannedDate: today })
  const reading = await t('Чтение: «Глубокая работа»', {
    projectId: growth.id,
    estimateMin: 60,
    plannedDate: today,
  })
  const english = await t('Английский: 20 новых слов', {
    projectId: growth.id,
    estimateMin: 30,
    plannedDate: addDays(today, 1),
  })
  await t('Подготовить отчёт за неделю', {
    projectId: work.id,
    priority: 1,
    estimateMin: 40,
    plannedDate: addDays(today, 2),
    dueDate: addDays(today, 4),
  })
  await t('Разобрать входящие', { estimateMin: 15 })

  // Two weeks of history: several non-overlapping sessions per day.
  const pool: Task[] = [api, postgres, tests, sport, reading, english]
  const entries: TimeEntry[] = []
  for (let d = 14; d >= 0; d--) {
    const day = addDays(today, -d)
    let cursor = startOfLocalDate(day) + 9 * HOUR + Math.floor(rand() * 60) * MIN
    const sessions = 3 + Math.floor(rand() * 4)
    for (let i = 0; i < sessions; i++) {
      const length = (25 + Math.floor(rand() * 70)) * MIN
      const end = cursor + length
      if (end > now) break
      const task = pool[Math.floor(rand() * pool.length)]!
      const withoutTask = rand() < 0.08
      entries.push({
        ...created(cursor),
        start: cursor,
        end,
        source: rand() < 0.3 ? 'pomodoro' : 'timer',
        ...(withoutTask ? {} : { taskId: task.id }),
      })
      cursor = end + (10 + Math.floor(rand() * 80)) * MIN
    }
  }
  await db.timeEntries.bulkAdd(entries)

  // Today's plan.
  const at = (h: number, m = 0) => startOfLocalDate(today) + h * HOUR + m * MIN
  await timeBlocksRepo.create({ title: 'Утренние ритуалы', kind: 'routine', start: at(8), end: at(9) })
  await timeBlocksRepo.create({ taskId: api.id, start: at(9, 30), end: at(11, 30) })
  await timeBlocksRepo.create({ title: 'Перерыв', kind: 'break', start: at(11, 30), end: at(12) })
  await timeBlocksRepo.create({ taskId: postgres.id, start: at(12), end: at(13, 30) })
  await timeBlocksRepo.create({ title: 'Обед', kind: 'break', start: at(13, 30), end: at(14, 15) })
  await timeBlocksRepo.create({ taskId: tests.id, start: at(14, 30), end: at(15, 30) })
  await timeBlocksRepo.create({ taskId: sport.id, start: at(18), end: at(19) })
  await timeBlocksRepo.create({ taskId: reading.id, start: at(20), end: at(21), origin: 'mentor' })

  return { entries: entries.length }
}
