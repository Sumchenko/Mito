import { Dexie, type EntityTable } from 'dexie'
import type { Project, Tag, Task, TimeBlock, TimeEntry } from './types'

export const SCHEMA_VERSION = 1

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

  constructor(name = 'mito') {
    super(name)
    this.version(SCHEMA_VERSION).stores({
      projects: 'id, order, updatedAt',
      tags: 'id, name, updatedAt',
      tasks: 'id, projectId, parentId, status, plannedDate, dueDate, *tagIds, order, updatedAt',
      timeEntries: 'id, taskId, start, end, updatedAt',
      timeBlocks: 'id, taskId, start, end, updatedAt',
    })
  }
}

export const db = new MitoDB()

/** Tables in dependency order — used by backup and seeding. */
export const allTables = () =>
  [db.projects, db.tags, db.tasks, db.timeEntries, db.timeBlocks] as const
