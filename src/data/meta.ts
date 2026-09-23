import { newId } from './ids'
import type { SyncMeta } from './types'

/** Fields every new record gets. */
export function created(now = Date.now()): SyncMeta {
  return { id: newId(now), createdAt: now, updatedAt: now }
}

export const alive = <T extends SyncMeta>(record: T | undefined): record is T =>
  record !== undefined && record.deletedAt === undefined

/**
 * Drops keys whose value is `undefined`: keeps stored records tidy and stops partial patches
 * from erasing fields by accident (Dexie treats `undefined` in an update as "delete key").
 */
export function definedOnly<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>
}
