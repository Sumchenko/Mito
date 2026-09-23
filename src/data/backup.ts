import { allTables, db, SCHEMA_VERSION } from './db'
import { DomainError } from './errors'
import type { Project, Tag, Task, TimeBlock, TimeEntry } from './types'

export interface Backup {
  format: 'mito-backup'
  schemaVersion: number
  exportedAt: number
  data: {
    projects: Project[]
    tags: Tag[]
    tasks: Task[]
    timeEntries: TimeEntry[]
    timeBlocks: TimeBlock[]
  }
}

const TABLE_KEYS = ['projects', 'tags', 'tasks', 'timeEntries', 'timeBlocks'] as const

/** Full snapshot, tombstones included, so a restore reproduces the exact state. */
export async function exportBackup(): Promise<Backup> {
  return db.transaction('r', allTables(), async () => ({
    format: 'mito-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    data: {
      projects: await db.projects.toArray(),
      tags: await db.tags.toArray(),
      tasks: await db.tasks.toArray(),
      timeEntries: await db.timeEntries.toArray(),
      timeBlocks: await db.timeBlocks.toArray(),
    },
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural check of untrusted input — enough to refuse foreign or truncated files. */
export function parseBackup(raw: unknown): Backup {
  if (!isRecord(raw) || raw.format !== 'mito-backup' || !isRecord(raw.data)) {
    throw new DomainError('backup_invalid', 'Not a Mito backup file')
  }
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion > SCHEMA_VERSION) {
    throw new DomainError('backup_version', 'Backup was made by a newer version of Mito')
  }
  for (const key of TABLE_KEYS) {
    const rows = raw.data[key]
    if (!Array.isArray(rows)) throw new DomainError('backup_invalid', `Missing ${key}`)
    for (const row of rows) {
      if (
        !isRecord(row) ||
        typeof row.id !== 'string' ||
        typeof row.createdAt !== 'number' ||
        typeof row.updatedAt !== 'number'
      ) {
        throw new DomainError('backup_invalid', `Malformed record in ${key}`)
      }
    }
  }
  return raw as unknown as Backup
}

/** Replaces all local data with the backup contents, atomically. */
export async function restoreBackup(raw: unknown) {
  const backup = parseBackup(raw)
  await db.transaction('rw', allTables(), async () => {
    for (const table of allTables()) await table.clear()
    await db.projects.bulkAdd(backup.data.projects)
    await db.tags.bulkAdd(backup.data.tags)
    await db.tasks.bulkAdd(backup.data.tasks)
    await db.timeEntries.bulkAdd(backup.data.timeEntries)
    await db.timeBlocks.bulkAdd(backup.data.timeBlocks)
  })
  return Object.fromEntries(TABLE_KEYS.map((k) => [k, backup.data[k].length])) as Record<
    (typeof TABLE_KEYS)[number],
    number
  >
}

export async function clearAllData() {
  await db.transaction('rw', allTables(), async () => {
    for (const table of allTables()) await table.clear()
  })
}
