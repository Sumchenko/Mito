import { afterEach, describe, expect, it } from 'vitest'
import { MitoDB } from '@/data/db'
import type { Task } from '@/data/types'
import { prepareFor, pull, push, resetLocal, syncOnce } from './engine'
import { fakeRemote } from './fakeRemote'

let n = 0
const opened: MitoDB[] = []
/** A fresh local database, as on a separate device. */
const device = () => {
  const db = new MitoDB(`sync-test-${++n}`)
  opened.push(db)
  return db
}
afterEach(async () => {
  for (const db of opened.splice(0)) await db.delete()
})

/** Outbox entries are written after the change's transaction commits. */
const settle = () => new Promise((r) => setTimeout(r, 30))

const task = (id: string, title: string, updatedAt: number, extra: Partial<Task> = {}): Task => ({
  id,
  createdAt: 1,
  updatedAt,
  title,
  tagIds: [],
  status: 'open',
  priority: 0,
  order: 0,
  ...extra,
})

describe('outbox', () => {
  it('queues local writes once per record', async () => {
    const db = device()
    await db.tasks.put(task('a', 'One', 10))
    await db.tasks.put(task('a', 'One, edited', 11))
    await db.tasks.put(task('b', 'Two', 10))
    await settle()
    expect((await db.outbox.toArray()).map((e) => e.key).sort()).toEqual(['tasks:a', 'tasks:b'])
  })

  it('does not queue writes of an aborted transaction', async () => {
    const db = device()
    await db
      .transaction('rw', db.tasks, async () => {
        await db.tasks.put(task('a', 'One', 10))
        throw new Error('abort')
      })
      .catch(() => {})
    await settle()
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('push and pull', () => {
  it('pushes the outbox and clears it', async () => {
    const db = device()
    const remote = fakeRemote()
    await db.tasks.put(task('a', 'One', 10))
    await settle()
    expect(await push(db, remote)).toBe(1)
    expect((remote.rows.get('a')?.doc as Task | undefined)?.title).toBe('One')
    expect(await db.outbox.count()).toBe(0)
  })

  it('keeps an entry that changed again while the push was in flight', async () => {
    const db = device()
    const remote = fakeRemote()
    await db.tasks.put(task('a', 'One', 10))
    await settle()
    const original = remote.push.bind(remote)
    remote.push = async (changes) => {
      await original(changes)
      await db.tasks.put(task('a', 'One, again', 11))
      await settle()
    }
    await push(db, remote)
    expect(await db.outbox.count()).toBe(1)
  })

  it('applies newer server versions without echoing them back', async () => {
    const db = device()
    const remote = fakeRemote()
    await remote.push([{ id: 'a', collection: 'tasks', doc: task('a', 'Server', 20), updatedAt: 20, deletedAt: null }])
    await db.tasks.put(task('b', 'Local newer', 50))
    await remote.push([{ id: 'b', collection: 'tasks', doc: task('b', 'Server older', 40), updatedAt: 40, deletedAt: null }])
    await settle()
    await db.outbox.clear()

    await pull(db, remote)
    await settle()
    expect((await db.tasks.get('a'))?.title).toBe('Server')
    expect((await db.tasks.get('b'))?.title).toBe('Local newer')
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('two devices', () => {
  it('converge, with the later edit winning and deletions propagating', async () => {
    const remote = fakeRemote()
    const phone = device()
    const laptop = device()

    await phone.tasks.put(task('a', 'Buy milk', 10))
    await phone.tasks.put(task('b', 'Call mom', 10))
    await settle()
    await syncOnce(phone, remote)
    await syncOnce(laptop, remote)
    expect(await laptop.tasks.count()).toBe(2)

    // Both edit "a" offline; the laptop edits later. The phone deletes "b".
    await phone.tasks.put(task('a', 'Buy oat milk', 20))
    await laptop.tasks.put(task('a', 'Buy milk and bread', 30))
    await phone.tasks.put(task('b', 'Call mom', 25, { deletedAt: 25 }))
    await settle()
    await syncOnce(phone, remote)
    await syncOnce(laptop, remote)
    await syncOnce(phone, remote)

    for (const db of [phone, laptop]) {
      expect((await db.tasks.get('a'))?.title).toBe('Buy milk and bread')
      expect((await db.tasks.get('b'))?.deletedAt).toBe(25)
      expect(await db.outbox.count()).toBe(0)
    }
  })
})

describe('ownership', () => {
  it('adopts guest data into the account on first sign-in', async () => {
    const db = device()
    const remote = fakeRemote()
    await db.tasks.put(task('a', 'Guest task', 10))
    await settle()
    await db.outbox.clear() // e.g. data created before sync existed

    expect(await prepareFor(db, 'user-1')).toBe('adopted')
    await syncOnce(db, remote)
    expect(remote.rows.has('a')).toBe(true)
    expect(await prepareFor(db, 'user-1')).toBe('same')
  })

  it("never uploads another account's data", async () => {
    const db = device()
    const remote = fakeRemote()
    await prepareFor(db, 'user-1')
    await db.tasks.put(task('a', 'Private', 10))
    await settle()

    expect(await prepareFor(db, 'user-2')).toBe('switched')
    await syncOnce(db, remote)
    expect(remote.rows.size).toBe(0)
    expect(await db.tasks.count()).toBe(0)
  })

  it('forgets everything on reset', async () => {
    const db = device()
    await prepareFor(db, 'user-1')
    await db.tasks.put(task('a', 'x', 10))
    await settle()
    await resetLocal(db)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
    expect(await db.syncState.count()).toBe(0)
  })
})
