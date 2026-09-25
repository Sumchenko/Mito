import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { MitoDB } from '@/data/db'
import type { Task } from '@/data/types'
import { prepareFor, syncOnce } from './engine'
import { supabaseRemote } from './supabase'

/*
 * Integration test against a running local Supabase (`npx supabase start`):
 *   SUPABASE_IT=1 npx vitest run src/sync/supabase.it.test.ts
 * Skipped otherwise, so the normal test run needs no Docker.
 */
const URL = 'http://127.0.0.1:54321'
// Vitest runs in Node; the app's tsconfig has no Node types, so reach the env untyped.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ANON = env.SUPABASE_ANON_KEY ?? ''
const enabled = env.SUPABASE_IT === '1' && ANON !== ''

const settle = () => new Promise((r) => setTimeout(r, 30))
const opened: MitoDB[] = []
afterAll(async () => {
  for (const db of opened) await db.delete()
})

async function account(email: string) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signUp({ email, password: 'correct-horse-battery' })
  if (error) throw error
  return { client, userId: data.user!.id }
}

const task = (id: string, title: string, updatedAt: number): Task => ({
  id,
  createdAt: updatedAt,
  updatedAt,
  title,
  tagIds: [],
  status: 'open',
  priority: 0,
  order: 0,
})

describe.skipIf(!enabled)('sync through Supabase', () => {
  it('syncs two devices of one account and hides data from other accounts', async () => {
    const stamp = Date.now()
    const alice = await account(`alice-${stamp}@example.com`)
    const mallory = await account(`mallory-${stamp}@example.com`)

    const phone = new MitoDB(`it-phone-${stamp}`)
    const laptop = new MitoDB(`it-laptop-${stamp}`)
    opened.push(phone, laptop)
    await prepareFor(phone, alice.userId)
    await prepareFor(laptop, alice.userId)

    const id = crypto.randomUUID()
    await phone.tasks.put(task(id, 'From the phone', stamp))
    await settle()
    await syncOnce(phone, supabaseRemote(alice.client))
    await syncOnce(laptop, supabaseRemote(alice.client))
    expect((await laptop.tasks.get(id))?.title).toBe('From the phone')

    // An older write loses; a newer one wins.
    await laptop.tasks.put(task(id, 'Stale', stamp - 1000))
    await settle()
    await syncOnce(laptop, supabaseRemote(alice.client))
    await phone.tasks.put(task(id, 'Newest', stamp + 1000))
    await settle()
    await syncOnce(phone, supabaseRemote(alice.client))
    const { data } = await alice.client.from('records').select('doc').eq('id', id).single()
    expect((data as { doc: Task }).doc.title).toBe('Newest')

    // Row-level security: another account sees nothing and cannot overwrite.
    const { data: foreign } = await mallory.client.from('records').select('id')
    expect(foreign).toEqual([])
    await supabaseRemote(mallory.client)
      .push([{ id, collection: 'tasks', doc: task(id, 'Hijacked', stamp + 5000), updatedAt: stamp + 5000, deletedAt: null }])
      .catch(() => {})
    const { data: after } = await alice.client.from('records').select('doc').eq('id', id).single()
    expect((after as { doc: Task }).doc.title).toBe('Newest')
  }, 30_000)
})
