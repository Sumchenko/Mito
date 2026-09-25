import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SyncedTable } from '@/data/outbox'
import type { Change, Remote, RemoteRow } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The Supabase client, or null when the build has no backend configured — then Mito runs
 * purely locally and every account feature is hidden.
 */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null

interface RecordRow {
  id: string
  collection: SyncedTable
  doc: RemoteRow['doc']
  updated_at: number
  deleted_at: number | null
  rev: number
}

/** The sync protocol over Supabase: an RPC for pushes, a plain select for pulls. */
export function supabaseRemote(client: SupabaseClient): Remote {
  return {
    async push(changes: Change[]) {
      const { error } = await client.rpc('push_records', { changes })
      if (error) throw new Error(`push failed: ${error.message}`)
    },
    async pull(since: number, limit: number) {
      const { data, error } = await client
        .from('records')
        .select('id, collection, doc, updated_at, deleted_at, rev')
        .gt('rev', since)
        .order('rev')
        .limit(limit)
      if (error) throw new Error(`pull failed: ${error.message}`)
      return (data as RecordRow[]).map((r) => ({
        id: r.id,
        collection: r.collection,
        doc: r.doc,
        updatedAt: Number(r.updated_at),
        deletedAt: r.deleted_at === null ? null : Number(r.deleted_at),
        rev: Number(r.rev),
      }))
    },
  }
}

/** Calls `onChange` whenever another device writes; the caller pulls in response. */
export function subscribeToChanges(client: SupabaseClient, userId: string, onChange: () => void) {
  const channel = client
    .channel(`records:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe()
  return () => void client.removeChannel(channel)
}
