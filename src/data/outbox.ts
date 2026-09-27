import { Dexie, type DBCore, type DBCoreMutateRequest, type EntityTable, type Middleware } from 'dexie'

/** Tables whose records sync with the server. Their names double as the server's `collection`. */
export const SYNCED_TABLES = [
  'projects',
  'tags',
  'tasks',
  'timeEntries',
  'timeBlocks',
  'goals',
  'mentorNotes',
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]
const synced = new Set<string>(SYNCED_TABLES)

/** A record changed locally and not yet confirmed by the server. */
export interface OutboxEntry {
  /** `${table}:${id}` — one entry per record however often it changes. */
  key: string
  table: SyncedTable
  id: string
  /** Bumped on every change, so a push only clears entries it actually sent. */
  seq: number
}

/** Marks a transaction as applying server changes, which must not echo back into the outbox. */
const REMOTE = Symbol('mito.remote')
type MarkedTransaction = IDBTransaction & { [REMOTE]?: boolean }

export function markRemote() {
  const trans = Dexie.currentTransaction?.idbtrans as MarkedTransaction | undefined
  if (!trans) throw new Error('markRemote() must be called inside a transaction')
  trans[REMOTE] = true
}

type Listener = () => void
const listeners = new Set<Listener>()
/** Called after local changes reach the outbox — the sync engine schedules a push. */
export function onOutboxChange(fn: Listener) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

let seq = Date.now()

/**
 * Dexie middleware that records every local write to a synced table. Keys are collected per
 * transaction and written to the outbox once it commits: an aborted transaction leaves no
 * trace, and the app's own transactions need not include the outbox table.
 *
 * Only add/put are tracked. Records are never hard-deleted by the app (deletions are
 * tombstones); `clear()` is a local reset and deliberately does not propagate.
 */
export function outboxMiddleware(getOutbox: () => EntityTable<OutboxEntry, 'key'>): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'outbox',
    create(down: DBCore): DBCore {
      return {
        ...down,
        table(name) {
          const table = down.table(name)
          if (!synced.has(name)) return table
          return {
            ...table,
            mutate(req: DBCoreMutateRequest) {
              return table.mutate(req).then((res) => {
                if (req.type !== 'add' && req.type !== 'put') return res
                const trans = req.trans as unknown as MarkedTransaction
                if (trans[REMOTE]) return res
                const ids: string[] = (res.results ?? req.values.map((v: { id: string }) => v.id)).filter(
                  (_: unknown, i: number) => !res.failures[i],
                )
                if (ids.length) {
                  const entries = ids.map((id) => ({ key: `${name}:${id}`, table: name as SyncedTable, id, seq: ++seq }))
                  trans.addEventListener('complete', () => {
                    // A separate transaction, outside whatever scope the write ran in.
                    void Dexie.ignoreTransaction(() => getOutbox().bulkPut(entries)).then(() =>
                      listeners.forEach((fn) => fn()),
                    )
                  })
                }
                return res
              })
            },
          }
        },
      }
    },
  }
}
