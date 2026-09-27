import { Dexie, type EntityTable } from 'dexie'
import { outboxMiddleware, type OutboxEntry } from './outbox'
import type { Goal, MentorNote, Project, Tag, Task, TimeBlock, TimeEntry } from './types'

export const SCHEMA_VERSION = 3

/**
 * Local IndexedDB store. Index choices follow the hot queries:
 * - tasks by project / parent / planned day / deadline / tag
 * - time entries and blocks by time range (`end` above range start, then `start` below end)
 * Components must not write here directly — go through the repositories in `./repos`.
 */
export class MitoDB extends Dexie {
  projects!: EntityTable<Project, 'id'>
  tags!: EntityTable<Tag, 'id'>
  tasks!: EntityTable<Task, 'id'>
  timeEntries!: EntityTable<TimeEntry, 'id'>
  timeBlocks!: EntityTable<TimeBlock, 'id'>
  goals!: EntityTable<Goal, 'id'>
  mentorNotes!: EntityTable<MentorNote, 'id'>
  /** Local changes waiting to be pushed to the server. */
  outbox!: EntityTable<OutboxEntry, 'key'>
  /** Sync bookkeeping: pull cursor, owner of the local data. */
  syncState!: EntityTable<{ key: string; value: unknown }, 'key'>

  constructor(name = 'mito') {
    super(name)
    this.version(1).stores({
      projects: 'id, order, updatedAt',
      tags: 'id, name, updatedAt',
      tasks: 'id, projectId, parentId, status, plannedDate, dueDate, *tagIds, order, updatedAt',
      timeEntries: 'id, taskId, start, end, updatedAt',
      timeBlocks: 'id, taskId, start, end, updatedAt',
    })
    // Stage 7: sync bookkeeping. Existing data is untouched.
    this.version(2).stores({ outbox: 'key, seq', syncState: 'key' })
    // Stage 8: learning goals and the mentor's notes; tasks know their goal.
    this.version(3).stores({
      tasks: 'id, projectId, parentId, status, plannedDate, dueDate, *tagIds, order, updatedAt, goalId',
      goals: 'id, status, order, updatedAt',
      mentorNotes: 'id, goalId, updatedAt',
    })
    this.use(outboxMiddleware(() => this.outbox))
  }
}

export const db = new MitoDB()

/** Tables in dependency order — used by backup and seeding. */
export const allTables = () =>
  [db.projects, db.tags, db.tasks, db.timeEntries, db.timeBlocks, db.goals, db.mentorNotes] as const
