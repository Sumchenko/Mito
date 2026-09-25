import type { Session } from '@supabase/supabase-js'
import { startSync, stopSync } from './controller'
import { supabase } from './supabase'

let initialized = false

/**
 * Follows the Supabase session: a signed-in user starts syncing, signing out stops it.
 * Also completes sign-ins that return to the app by URL (email links, Google).
 */
export function initAuth() {
  if (!supabase || initialized) return
  initialized = true
  const apply = (session: Session | null) => {
    // Deferred: Supabase advises against calling its API from inside the auth callback.
    window.setTimeout(() => {
      if (session?.user) void startSync(session.user.id, session.user.email)
      else stopSync()
    }, 0)
  }
  void confirmFromEmailLink().then(() => supabase!.auth.getSession().then(({ data }) => apply(data.session)))
  supabase.auth.onAuthStateChange((_event, session) => apply(session))
}

/**
 * Email links point at our own domain (`/auth/confirm?token_hash=…&type=…`), not at the
 * Supabase host, which may be unreachable for some users; the token is verified from here.
 * The email templates in the Supabase project must use this URL — see docs/DEPLOY.md.
 */
async function confirmFromEmailLink() {
  const url = new URL(window.location.href)
  if (url.pathname !== '/auth/confirm') return
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as 'email' | 'magiclink' | 'signup' | 'recovery' | null
  window.history.replaceState(null, '', '/settings')
  if (tokenHash && type && supabase) await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
}

export type AuthResult = { ok: true; notice?: 'check-email' } | { ok: false; error: string }

const redirectTo = () => `${window.location.origin}/settings`

const result = (error: { message: string } | null, notice?: 'check-email'): AuthResult =>
  error ? { ok: false, error: error.message } : { ok: true, notice }

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'disabled' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return result(error)
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'disabled' }
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } })
  // With email confirmation on, there is no session until the link is followed.
  return result(error, data.session ? undefined : 'check-email')
}

export async function sendMagicLink(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'disabled' }
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } })
  return result(error, 'check-email')
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: 'disabled' }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } })
  return result(error)
}
