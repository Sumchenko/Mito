import type { MitoDB } from '@/data/db'
import { markRemote, SYNCED_TABLES, type SyncedTable } from '@/data/outbox'
import type { SyncMeta } from '@/data/types'

/** A record as the server stores it. `doc` is the full local record, sync fields included. */
export interface RemoteRow {
  id: string
  collection: SyncedTable
  doc: SyncMeta
  updatedAt: number
  deletedAt: number | null
  rev: number
}

export interface Change {
  id: string
  collection: SyncedTable
  doc: SyncMeta
  updatedAt: number
  deletedAt: number | null
}

/** The server as the engine sees it — Supabase in the app, an in-memory fake in tests. */
export interface Remote {
  /** Upserts, keeping the newer version of each record (last write wins). */
  push(changes: Change[]): Promise<void>
  /** Rows with a revision above `since`, in revision order. */
  pull(since: number, limit: number): Promise<RemoteRow[]>
}

const PUSH_BATCH = 200
const PULL_BATCH = 500
const CURSOR = 'cursor'
const OWNER = 'owner'

const getState = async <T>(db: MitoDB, key: string) => (await db.syncState.get(key))?.value as T | undefined

/**
 * Sends the outbox to the server. An entry is cleared only if it was not touched again while
 * the push was in flight — a newer edit stays queued for the next round.
 */
export async function push(db: MitoDB, remote: Remote) {
  let sent = 0
  for (;;) {
    const entries = await db.outbox.orderBy('seq').limit(PUSH_BATCH).toArray()
    if (entries.length === 0) return sent

    const changes: Change[] = []
    for (const table of SYNCED_TABLES) {
      const ids = entries.filter((e) => e.table === table).map((e) => e.id)
      if (!ids.length) continue
      const records = (await db.table(table).bulkGet(ids)) as (SyncMeta | undefined)[]
      for (const doc of records) {
        // A record cleared locally (a reset) has nothing to send.
        if (doc) {
          changes.push({
            id: doc.id,
            collection: table,
            doc: doc as Change['doc'],
            updatedAt: doc.updatedAt,
            deletedAt: doc.deletedAt ?? null,
          })
        }
      }
    }
    if (changes.length) await remote.push(changes)
    sent += changes.length

    await db.transaction('rw', db.outbox, async () => {
      const current = await db.outbox.bulkGet(entries.map((e) => e.key))
      const done = entries.filter((e, i) => current[i]?.seq === e.seq).map((e) => e.key)
      await db.outbox.bulkDelete(done)
    })
    if (entries.length < PUSH_BATCH) return sent
  }
}

/**
 * Applies server changes above the cursor. A server version replaces the local one only if
 * it is newer; applied changes are marked remote so they do not bounce back to the server.
 */
export async function pull(db: MitoDB, remote: Remote) {
  let received = 0
  let cursor = (await getState<number>(db, CURSOR)) ?? 0
  for (;;) {
    const rows = await remote.pull(cursor, PULL_BATCH)
    if (rows.length === 0) return received

    await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.syncState], async () => {
      markRemote()
      for (const table of SYNCED_TABLES) {
        const incoming = rows.filter((r) => r.collection === table)
        if (!incoming.length) continue
        const local = (await db.table(table).bulkGet(incoming.map((r) => r.id))) as (SyncMeta | undefined)[]
        const newer = incoming.filter((r, i) => !local[i] || local[i]!.updatedAt < r.updatedAt).map((r) => r.doc)
        if (newer.length) await db.table(table).bulkPut(newer)
      }
      cursor = rows[rows.length - 1]!.rev
      await db.syncState.put({ key: CURSOR, value: cursor })
    })
    received += rows.length
    if (rows.length < PULL_BATCH) return received
  }
}

/** One full round: local changes up, then everything new down. */
export async function syncOnce(db: MitoDB, remote: Remote) {
  const pushed = await push(db, remote)
  const pulled = await pull(db, remote)
  return { pushed, pulled }
}

/**
 * Makes the local database belong to `userId` before syncing. Guest data (no owner yet) is
 * adopted into the account: everything is queued for upload. Data of a different account is
 * never uploaded — it is cleared first.
 */
export async function prepareFor(db: MitoDB, userId: string) {
  const owner = await getState<string>(db, OWNER)
  if (owner === userId) return 'same' as const
  if (owner && owner !== userId) await resetLocal(db)

  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncState], async () => {
    let seq = Date.now()
    for (const table of SYNCED_TABLES) {
      const ids = (await db.table(table).toCollection().primaryKeys()) as string[]
      await db.outbox.bulkPut(ids.map((id) => ({ key: `${table}:${id}`, table, id, seq: ++seq })))
    }
    await db.syncState.bulkPut([
      { key: OWNER, value: userId },
      { key: CURSOR, value: 0 },
    ])
  })
  return owner ? ('switched' as const) : ('adopted' as const)
}

/** Forgets everything local: records, queue and sync position. Used on sign-out. */
export async function resetLocal(db: MitoDB) {
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db.table(t)), db.outbox, db.syncState], async () => {
    for (const table of SYNCED_TABLES) await db.table(table).clear()
    await db.outbox.clear()
    await db.syncState.clear()
  })
}

export const localOwner = (db: MitoDB) => getState<string>(db, OWNER)
