import type { Table } from 'dexie'
import { allTables, db, SCHEMA_VERSION } from './db'
import { DomainError } from './errors'
import type { Project, SyncMeta, Tag, Task, TimeBlock, TimeEntry } from './types'

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

/** Whether the local data belongs to an account (then removals must sync as tombstones). */
const isSynced = async () => (await db.syncState.get('owner')) !== undefined

/**
 * Removes every record. Locally-only data is simply cleared. Account data is tombstoned
 * instead, so the removal reaches the server and the other devices.
 */
async function removeAll(synced: boolean) {
  const now = Date.now()
  for (const table of allTables() as readonly Table<SyncMeta, string>[]) {
    if (synced) await table.filter((r) => r.deletedAt === undefined).modify({ deletedAt: now, updatedAt: now })
    else await table.clear()
  }
}

/**
 * Replaces all data with the backup contents, atomically. For an account, restored records
 * are stamped as fresh edits — otherwise newer versions on the server would win over them.
 */
export async function restoreBackup(raw: unknown) {
  const backup = parseBackup(raw)
  const synced = await isSynced()
  const now = Date.now()
  const fresh = <T extends { updatedAt: number }>(rows: T[]) => (synced ? rows.map((r) => ({ ...r, updatedAt: now })) : rows)
  await db.transaction('rw', allTables(), async () => {
    await removeAll(synced)
    await db.projects.bulkPut(fresh(backup.data.projects))
    await db.tags.bulkPut(fresh(backup.data.tags))
    await db.tasks.bulkPut(fresh(backup.data.tasks))
    await db.timeEntries.bulkPut(fresh(backup.data.timeEntries))
    await db.timeBlocks.bulkPut(fresh(backup.data.timeBlocks))
  })
  return Object.fromEntries(TABLE_KEYS.map((k) => [k, backup.data[k].length])) as Record<
    (typeof TABLE_KEYS)[number],
    number
  >
}

/** Deletes everything — on every device, when the data belongs to an account. */
export async function clearAllData() {
  const synced = await isSynced()
  await db.transaction('rw', allTables(), () => removeAll(synced))
}
