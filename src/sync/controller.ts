import { create } from 'zustand'
import { db } from '@/data/db'
import { onOutboxChange } from '@/data/outbox'
import { prepareFor, resetLocal, syncOnce, type Remote } from './engine'
import { subscribeToChanges, supabase, supabaseRemote } from './supabase'

export type SyncStatus =
  /** No backend configured in this build. */
  | 'disabled'
  /** Not signed in: data lives only on this device. */
  | 'guest'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

interface SyncState {
  status: SyncStatus
  email?: string
  lastSyncedAt?: number
  error?: string
}

export const useSync = create<SyncState>(() => ({ status: supabase ? 'guest' : 'disabled' }))

/** Local edits are batched briefly; a remote change is fetched almost at once. */
const LOCAL_DELAY = 800
const REMOTE_DELAY = 250
const SAFETY_INTERVAL = 5 * 60_000

let session: { userId: string; remote: Remote; stop: () => void } | null = null
let timer: number | undefined
let running = false
let again = false
let failures = 0

const schedule = (delay: number) => {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void run(), delay)
}

async function run() {
  const current = session
  if (!current) return
  if (running) {
    again = true
    return
  }
  if (!navigator.onLine) {
    useSync.setState({ status: 'offline' })
    return
  }
  running = true
  useSync.setState({ status: 'syncing' })
  try {
    await syncOnce(db, current.remote)
    if (session !== current) return
    failures = 0
    useSync.setState({ status: 'synced', lastSyncedAt: Date.now(), error: undefined })
  } catch (e) {
    if (session !== current) return
    failures++
    useSync.setState({ status: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e) })
    // Back off: 2s, 4s, 8s … up to a minute.
    schedule(Math.min(60_000, 1000 * 2 ** failures))
  } finally {
    running = false
    if (again && session === current) {
      again = false
      schedule(0)
    }
  }
}

/** Starts syncing the local database with `userId`'s account. */
export async function startSync(userId: string, email?: string) {
  if (!supabase) return
  if (session?.userId === userId) return
  stopSync()
  useSync.setState({ status: 'syncing', email })
  await prepareFor(db, userId)

  const onOnline = () => schedule(0)
  const onOffline = () => useSync.setState({ status: 'offline' })
  const onVisible = () => document.visibilityState === 'visible' && schedule(0)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisible)
  const unsubscribeOutbox = onOutboxChange(() => schedule(LOCAL_DELAY))
  const unsubscribeRemote = subscribeToChanges(supabase, userId, () => schedule(REMOTE_DELAY))
  const interval = window.setInterval(() => schedule(0), SAFETY_INTERVAL)

  session = {
    userId,
    remote: supabaseRemote(supabase),
    stop: () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribeOutbox()
      unsubscribeRemote()
      window.clearInterval(interval)
    },
  }
  schedule(0)
}

export function stopSync() {
  session?.stop()
  session = null
  window.clearTimeout(timer)
  failures = 0
  useSync.setState({ status: supabase ? 'guest' : 'disabled', email: undefined, error: undefined })
}

/** Syncs right now, e.g. from a "Sync now" button. */
export const syncNow = () => schedule(0)

/**
 * Signs out and removes the account's data from this device (it stays in the account).
 * Pending changes are sent first when possible, so nothing made offline is lost silently.
 */
export async function signOutAndForget() {
  if (!supabase) return
  if (session && navigator.onLine) await syncOnce(db, session.remote).catch(() => {})
  stopSync()
  await supabase.auth.signOut()
  await resetLocal(db)
}
