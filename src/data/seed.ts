import { clearAllData } from './backup'
import { addDays, startOfLocalDate, toLocalDate } from './dates'
import { db } from './db'
import { created } from './meta'
import { projectsRepo } from './repos/projects'
import { tagsRepo } from './repos/tags'
import { tasksRepo } from './repos/tasks'
import { timeBlocksRepo } from './repos/timeBlocks'
import type { Project, Task, TimeBlock, TimeEntry } from './types'

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
 * Development-only demo data: projects, tasks for today and the coming days, ten weeks of
 * tracked history with past plans, and today's plan. Replaces everything currently stored.
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

  // Finished work from the past weeks — most history belongs here, as in real life.
  const pastTitles: [string, Project, number][] = [
    ['Ревью пул-реквестов', work, 60],
    ['Настроить CI для сервиса', work, 120],
    ['Созвон с командой', work, 45],
    ['Миграция на новую версию API', work, 240],
    ['Исправить утечку памяти', work, 90],
    ['Документация по развёртыванию', work, 60],
    ['Лекция по алгоритмам', study, 90],
    ['Конспект: транзакции в БД', study, 60],
    ['Курс по TypeScript: дженерики', study, 120],
    ['Задачи на графы', study, 90],
    ['Пробежка 5 км', health, 40],
    ['Йога', health, 30],
    ['Статья про привычки', growth, 45],
    ['Английский: сериал без субтитров', growth, 60],
    ['План на месяц', growth, 30],
  ]
  const HISTORY_DAYS = 70
  const past: Task[] = []
  for (const [i, [title, project, estimateMin]] of pastTitles.entries()) {
    const plannedDate = addDays(today, -1 - Math.floor((i * (HISTORY_DAYS - 2)) / pastTitles.length))
    const task = await tasksRepo.create({ title, projectId: project.id, plannedDate, estimateMin })
    const completedAt = startOfLocalDate(plannedDate) + 20 * HOUR
    await db.tasks.update(task.id, { status: 'done', completedAt })
    past.push({ ...task, status: 'done', completedAt })
  }

  // History: on weekdays a plan of two or three task blocks, followed with realistic slack —
  // some blocks done on time, some later that day, some skipped — plus unplanned sessions.
  // Weekends are lighter and unplanned. Candidates are trimmed so entries never overlap.
  const ongoing: Task[] = [postgres, english]
  const todayPool: Task[] = [api, postgres, tests]
  const entries: TimeEntry[] = []
  const blocks: TimeBlock[] = []
  const pick = (pool: Task[]) => pool[Math.floor(rand() * pool.length)]!
  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const day = addDays(today, -d)
    const base = startOfLocalDate(day)
    const weekend = new Date(base).getDay() % 6 === 0
    // A finished task is worked on in the week before it was completed, not forever.
    const recent = past.filter((x) => x.plannedDate! >= day && x.plannedDate! <= addDays(day, 7))
    // Today's open tasks were started in the last two weeks.
    const current = d <= 14 ? ongoing : []
    const pool = d === 0 ? todayPool : recent.length ? [...recent, ...recent, ...current] : ongoing
    const candidates: { start: number; end: number; taskId?: string; source: TimeEntry['source'] }[] = []
    const track = (start: number, length: number, taskId?: string) =>
      candidates.push({ start, end: start + Math.round(length), source: rand() < 0.3 ? 'pomodoro' : 'timer', ...(taskId ? { taskId } : {}) })

    if (!weekend && d > 0) {
      const slots = [9 * HOUR + 30 * MIN, 12 * HOUR, 15 * HOUR].slice(0, 2 + Math.floor(rand() * 2))
      for (const slot of slots) {
        const task = pick(pool)
        const length = (60 + Math.floor(rand() * 4) * 15) * MIN
        blocks.push({ ...created(base), taskId: task.id, start: base + slot, end: base + slot + length, kind: 'task', origin: 'user' })
        const roll = rand()
        if (roll < 0.55) track(base + slot + Math.floor(rand() * 20) * MIN, length * (0.6 + rand() * 0.5), task.id)
        else if (roll < 0.8) track(base + 18 * HOUR + Math.floor(rand() * 90) * MIN, length * (0.5 + rand() * 0.5), task.id)
      }
    }
    // Unplanned sessions: a few on weekdays (and all of today's), fewer at the weekend.
    const extra = weekend ? Math.floor(rand() * 3) : d === 0 ? 4 : 1 + Math.floor(rand() * 2)
    for (let i = 0; i < extra; i++) {
      const start = base + (8 + Math.floor(rand() * 13)) * HOUR + Math.floor(rand() * 4) * 15 * MIN
      track(start, (25 + Math.floor(rand() * 60)) * MIN, rand() < 0.1 ? undefined : pick(pool).id)
    }

    let last = 0
    for (const c of candidates.sort((a, b) => a.start - b.start)) {
      const start = Math.max(c.start, last + 5 * MIN)
      const end = Math.min(c.end, now)
      if (end - start < 10 * MIN) continue
      entries.push({ ...created(start), start, end, source: c.source, ...(c.taskId ? { taskId: c.taskId } : {}) })
      last = end
    }
  }
  await db.timeEntries.bulkAdd(entries)
  await db.timeBlocks.bulkAdd(blocks)

  // Estimates of finished tasks: what the time turned out to be, give or take — mostly
  // optimistic, as estimates tend to be.
  const tracked = new Map<string, number>()
  for (const e of entries) if (e.taskId) tracked.set(e.taskId, (tracked.get(e.taskId) ?? 0) + (e.end! - e.start))
  for (const task of past) {
    const minutes = (tracked.get(task.id) ?? 0) / MIN
    if (minutes > 0) await db.tasks.update(task.id, { estimateMin: Math.max(15, Math.round((minutes * (0.55 + rand() * 0.7)) / 15) * 15) })
  }

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
