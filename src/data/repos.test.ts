import { describe, expect, it } from 'vitest'
import { exportBackup, restoreBackup } from './backup'
import { toLocalDate } from './dates'
import { db } from './db'
import { projectsRepo } from './repos/projects'
import { tagsRepo } from './repos/tags'
import { tasksRepo } from './repos/tasks'
import { timeBlocksRepo } from './repos/timeBlocks'
import { timeEntriesRepo } from './repos/timeEntries'

const MIN = 60_000
const base = Date.now() - 24 * 60 * MIN // a day ago, safely in the past

describe('tasks', () => {
  it('creates with sensible defaults and trims the title', async () => {
    const task = await tasksRepo.create({ title: '  Write spec  ' })
    expect(task).toMatchObject({ title: 'Write spec', status: 'open', priority: 0, tagIds: [] })
    expect(await tasksRepo.get(task.id)).toMatchObject({ title: 'Write spec' })
  })

  it('rejects empty titles, bad dates and bad estimates', async () => {
    await expect(tasksRepo.create({ title: '   ' })).rejects.toMatchObject({ code: 'invalid' })
    await expect(
      tasksRepo.create({ title: 'x', plannedDate: '2026-02-30' as never }),
    ).rejects.toMatchObject({ code: 'invalid' })
    await expect(tasksRepo.create({ title: 'x', estimateMin: 0 })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('rejects references to missing projects', async () => {
    await expect(tasksRepo.create({ title: 'x', projectId: 'nope' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('keeps subtasks one level deep and in the parent project', async () => {
    const project = await projectsRepo.create({ name: 'Work' })
    const parent = await tasksRepo.create({ title: 'Parent', projectId: project.id })
    const child = await tasksRepo.create({ title: 'Child', parentId: parent.id })
    expect(child.projectId).toBe(project.id)

    await expect(tasksRepo.create({ title: 'Grandchild', parentId: child.id })).rejects.toMatchObject(
      { code: 'nesting_too_deep' },
    )
    const other = await tasksRepo.create({ title: 'Other' })
    await expect(tasksRepo.update(parent.id, { parentId: other.id })).rejects.toMatchObject({
      code: 'nesting_too_deep',
    })
  })

  it('moves subtasks along when the parent changes project', async () => {
    const a = await projectsRepo.create({ name: 'A' })
    const b = await projectsRepo.create({ name: 'B' })
    const parent = await tasksRepo.create({ title: 'Parent', projectId: a.id })
    const child = await tasksRepo.create({ title: 'Child', parentId: parent.id })
    await tasksRepo.update(parent.id, { projectId: b.id })
    expect((await tasksRepo.get(child.id))?.projectId).toBe(b.id)
  })

  it('clears optional fields with null and keeps them with undefined', async () => {
    const task = await tasksRepo.create({ title: 'x', dueDate: '2026-10-01', estimateMin: 30 })
    await tasksRepo.update(task.id, { dueDate: null })
    const updated = await tasksRepo.get(task.id)
    expect(updated?.dueDate).toBeUndefined()
    expect(updated?.estimateMin).toBe(30)
  })

  it('records completion time and clears it when reopened', async () => {
    const task = await tasksRepo.create({ title: 'x' })
    await tasksRepo.setStatus(task.id, 'done')
    expect((await tasksRepo.get(task.id))?.completedAt).toBeTypeOf('number')
    await tasksRepo.setStatus(task.id, 'open')
    expect((await tasksRepo.get(task.id))?.completedAt).toBeUndefined()
  })

  it('lists tasks planned for a day in order, without deleted ones', async () => {
    const day = toLocalDate()
    const first = await tasksRepo.create({ title: 'First', plannedDate: day })
    const second = await tasksRepo.create({ title: 'Second', plannedDate: day })
    await tasksRepo.create({ title: 'Other day', plannedDate: '2020-01-01' })
    await tasksRepo.remove(first.id)
    expect((await tasksRepo.listPlannedFor(day)).map((t) => t.id)).toEqual([second.id])
  })

  it('on delete: cascades to subtasks, stops its timer, keeps tracked time, drops future blocks', async () => {
    const parent = await tasksRepo.create({ title: 'Parent' })
    const child = await tasksRepo.create({ title: 'Child', parentId: parent.id })
    const past = await timeEntriesRepo.addManual({ taskId: parent.id, start: base, end: base + 30 * MIN })
    await timeEntriesRepo.start({ taskId: child.id })
    const futureBlock = await timeBlocksRepo.create({
      taskId: parent.id,
      start: Date.now() + 60 * MIN,
      end: Date.now() + 120 * MIN,
    })

    await tasksRepo.remove(parent.id)

    expect(await tasksRepo.get(parent.id)).toBeUndefined()
    expect(await tasksRepo.get(child.id)).toBeUndefined()
    expect(await timeEntriesRepo.running()).toBeUndefined()
    expect((await db.timeEntries.get(past.id))?.deletedAt).toBeUndefined()
    expect((await db.timeBlocks.get(futureBlock.id))?.deletedAt).toBeTypeOf('number')
  })
})

describe('time entries', () => {
  it('allows only one running timer: starting again stops the previous one', async () => {
    const first = await timeEntriesRepo.start({ at: base })
    const second = await timeEntriesRepo.start({ at: base + 10 * MIN })
    expect((await db.timeEntries.get(first.id))?.end).toBe(base + 10 * MIN)
    expect((await timeEntriesRepo.running())?.id).toBe(second.id)
  })

  it('can run without a task and be assigned later', async () => {
    const entry = await timeEntriesRepo.start({ at: base })
    await timeEntriesRepo.stop(base + 20 * MIN)
    const task = await tasksRepo.create({ title: 'Later' })
    await timeEntriesRepo.assignTask([entry.id], task.id)
    expect((await db.timeEntries.get(entry.id))?.taskId).toBe(task.id)
  })

  it('rejects manual entries that overlap existing time', async () => {
    await timeEntriesRepo.addManual({ start: base, end: base + 60 * MIN })
    await expect(
      timeEntriesRepo.addManual({ start: base + 30 * MIN, end: base + 90 * MIN }),
    ).rejects.toMatchObject({ code: 'time_overlap' })
    // Touching edges is fine.
    await expect(
      timeEntriesRepo.addManual({ start: base + 60 * MIN, end: base + 90 * MIN }),
    ).resolves.toBeDefined()
  })

  it('rejects manual entries that overlap the running timer', async () => {
    await timeEntriesRepo.start({ at: base })
    await expect(
      timeEntriesRepo.addManual({ start: base + 5 * MIN, end: base + 10 * MIN }),
    ).rejects.toMatchObject({ code: 'time_overlap' })
  })

  it('rejects inverted and future intervals', async () => {
    await expect(timeEntriesRepo.addManual({ start: base, end: base })).rejects.toMatchObject({
      code: 'invalid',
    })
    const later = Date.now() + 60 * MIN
    await expect(
      timeEntriesRepo.addManual({ start: later, end: later + MIN }),
    ).rejects.toMatchObject({ code: 'invalid' })
  })

  it('edits without tripping over its own interval', async () => {
    const entry = await timeEntriesRepo.addManual({ start: base, end: base + 30 * MIN })
    await timeEntriesRepo.update(entry.id, { end: base + 45 * MIN })
    expect((await db.timeEntries.get(entry.id))?.end).toBe(base + 45 * MIN)
  })

  it('finds entries intersecting a range, including the running one', async () => {
    const a = await timeEntriesRepo.addManual({ start: base, end: base + 30 * MIN })
    await timeEntriesRepo.addManual({ start: base + 120 * MIN, end: base + 150 * MIN })
    const running = await timeEntriesRepo.start({ at: base + 200 * MIN })

    const early = await timeEntriesRepo.inRange(base + 20 * MIN, base + 60 * MIN)
    expect(early.map((e) => e.id)).toEqual([a.id])
    const late = await timeEntriesRepo.inRange(base + 190 * MIN, base + 300 * MIN)
    expect(late.map((e) => e.id)).toEqual([running.id])
  })

  it('ignores deleted entries', async () => {
    const entry = await timeEntriesRepo.addManual({ start: base, end: base + 30 * MIN })
    await timeEntriesRepo.remove(entry.id)
    expect(await timeEntriesRepo.inRange(base, base + 60 * MIN)).toEqual([])
    // The freed slot can be reused.
    await expect(
      timeEntriesRepo.addManual({ start: base, end: base + 30 * MIN }),
    ).resolves.toBeDefined()
  })
})

describe('time blocks', () => {
  it('needs a task or a title and a positive length', async () => {
    await expect(timeBlocksRepo.create({ start: base, end: base + MIN })).rejects.toMatchObject({
      code: 'invalid',
    })
    await expect(
      timeBlocksRepo.create({ title: 'Lunch', start: base, end: base }),
    ).rejects.toMatchObject({ code: 'invalid' })
    const block = await timeBlocksRepo.create({ title: 'Lunch', start: base, end: base + MIN })
    expect(block.kind).toBe('event')
  })

  it('may overlap — plans are intentions, not facts', async () => {
    await timeBlocksRepo.create({ title: 'A', start: base, end: base + 60 * MIN })
    await timeBlocksRepo.create({ title: 'B', start: base + 30 * MIN, end: base + 90 * MIN })
    expect(await timeBlocksRepo.inRange(base, base + 90 * MIN)).toHaveLength(2)
  })
})

describe('projects and tags', () => {
  it('deleting a project moves its tasks to the inbox', async () => {
    const project = await projectsRepo.create({ name: 'Old' })
    const task = await tasksRepo.create({ title: 'Keep me', projectId: project.id })
    await projectsRepo.remove(project.id)
    expect((await tasksRepo.get(task.id))?.projectId).toBeUndefined()
    expect((await tasksRepo.listByProject(null)).map((t) => t.id)).toContain(task.id)
  })

  it('archived projects are hidden by default', async () => {
    const project = await projectsRepo.create({ name: 'Done' })
    await projectsRepo.setArchived(project.id, true)
    expect(await projectsRepo.list()).toEqual([])
    expect(await projectsRepo.list({ includeArchived: true })).toHaveLength(1)
  })

  it('deleting a tag detaches it from tasks', async () => {
    const tag = await tagsRepo.create({ name: 'focus' })
    const task = await tasksRepo.create({ title: 'x', tagIds: [tag.id] })
    await tagsRepo.remove(tag.id)
    expect((await tasksRepo.get(task.id))?.tagIds).toEqual([])
  })
})

describe('backup', () => {
  it('round-trips all data', async () => {
    const project = await projectsRepo.create({ name: 'P' })
    await tasksRepo.create({ title: 'T', projectId: project.id })
    await timeEntriesRepo.addManual({ start: base, end: base + MIN })
    const backup = JSON.parse(JSON.stringify(await exportBackup()))

    await db.tasks.clear()
    const counts = await restoreBackup(backup)
    expect(counts).toMatchObject({ projects: 1, tasks: 1, timeEntries: 1 })
    expect(await tasksRepo.listByProject(project.id)).toHaveLength(1)
  })

  it('refuses foreign files and newer versions', async () => {
    await expect(restoreBackup({ hello: 'world' })).rejects.toMatchObject({ code: 'backup_invalid' })
    const newer = { ...(await exportBackup()), schemaVersion: 999 }
    await expect(restoreBackup(newer)).rejects.toMatchObject({ code: 'backup_version' })
  })

  it('leaves existing data untouched when the file is malformed', async () => {
    await tasksRepo.create({ title: 'Survivor' })
    const broken = await exportBackup()
    ;(broken.data.tasks as unknown[]).push({ nope: true })
    await expect(restoreBackup(broken)).rejects.toMatchObject({ code: 'backup_invalid' })
    expect(await db.tasks.count()).toBe(1)
  })
})
