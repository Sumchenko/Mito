import { MailRegular } from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { duration, ease } from '@/design/motion'
import { sendMagicLink, signInWithGoogle, signInWithPassword, signUp, type AuthResult } from '@/sync/auth'
import { Button } from '@/ui/Button'
import d from '@/ui/Dialog.module.css'
import f from '@/ui/fields.module.css'
import { Segmented } from '@/ui/Segmented'
import { closeAuthDialog, useAuthDialog, type AuthMode } from './authDialogStore'
import s from './account.module.css'

/** Google sign-in shows only where the provider is configured. */
const GOOGLE = import.meta.env.VITE_AUTH_GOOGLE === '1'
const MIN_PASSWORD = 8

/** Maps Supabase auth messages to friendly, translated text. */
function useErrorText() {
  const { t } = useTranslation()
  return (message: string) => {
    const m = message.toLowerCase()
    if (m.includes('invalid login')) return t('account.dialog.errors.invalid')
    if (m.includes('signups') && m.includes('disabled')) return t('account.dialog.errors.closed')
    if (m.includes('already registered') || m.includes('already exists')) return t('account.dialog.errors.exists')
    // The server's password policy: characters of each kind, or a minimum length.
    if (m.includes('password') && m.includes('should contain')) return t('account.dialog.errors.simple')
    if (m.includes('password')) return t('account.dialog.errors.weak')
    if (m.includes('not confirmed')) return t('account.dialog.errors.unconfirmed')
    if (m.includes('email') && m.includes('invalid')) return t('account.dialog.errors.email')
    if (m.includes('rate') || m.includes('security purposes')) return t('account.dialog.errors.rate')
    if (m.includes('fetch') || m.includes('network')) return t('account.dialog.errors.network')
    return t('account.dialog.errors.unknown', { message })
  }
}

/** Sign in or sign up: password, an emailed link, or Google. */
export function AuthDialog() {
  const mode = useAuthDialog((st) => st.mode)
  return createPortal(
    <AnimatePresence>{mode && <AuthDialogBody key="auth" initialMode={mode} />}</AnimatePresence>,
    document.body,
  )
}

function AuthDialogBody({ initialMode }: { initialMode: AuthMode }) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const titleId = useId()
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAuthDialog()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = async (action: () => Promise<AuthResult>) => {
    setBusy(true)
    setError(null)
    const res = await action()
    setBusy(false)
    if (!res.ok) setError(errorText(res.error))
    else if (res.notice === 'check-email') setSentTo(email.trim())
    else closeAuthDialog()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (mode === 'signUp' && password.length < MIN_PASSWORD) {
      setError(t('account.dialog.errors.weak'))
      return
    }
    void run(() => (mode === 'signIn' ? signInWithPassword(address, password) : signUp(address, password)))
  }

  return (
    <motion.div
      className={d.smoke}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: duration.normal } }}
      exit={{ opacity: 0, transition: { duration: duration.fast } }}
      onMouseDown={(e) => e.target === e.currentTarget && closeAuthDialog()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${d.dialog} ${s.dialog}`}
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: duration.slow, ease: ease.out } }}
        exit={{ opacity: 0, scale: 1.02, transition: { duration: duration.fast, ease: ease.in } }}
      >
        <div className={d.body}>
          <h2 id={titleId} className={d.title}>
            {mode === 'signIn' ? t('account.dialog.titleSignIn') : t('account.dialog.titleSignUp')}
          </h2>
          <p className={s.lead}>
            {t('account.dialog.lead')} {t('account.dialog.adopt')}
          </p>

          {sentTo ? (
            <div className={s.sent}>
              <MailRegular />
              <p>{t('account.dialog.checkEmail', { email: sentTo })}</p>
              <Button onClick={closeAuthDialog}>{t('account.dialog.close')}</Button>
            </div>
          ) : (
            <>
              {GOOGLE && (
                <>
                  <Button className={s.wide} disabled={busy} onClick={() => void run(signInWithGoogle)}>
                    <GoogleMark /> {t('account.dialog.google')}
                  </Button>
                  <div className={s.or}>
                    <span>{t('account.dialog.or')}</span>
                  </div>
                </>
              )}

              <Segmented<AuthMode>
                aria-label={t('account.dialog.titleSignIn')}
                value={mode}
                options={[
                  { value: 'signIn', label: t('account.dialog.modeSignIn') },
                  { value: 'signUp', label: t('account.dialog.modeSignUp') },
                ]}
                onChange={(m) => {
                  setMode(m)
                  setError(null)
                }}
              />

              <form className={s.form} onSubmit={submit}>
                <label className={s.field}>
                  <span>{t('account.dialog.email')}</span>
                  <input
                    className={f.control}
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className={s.field}>
                  <span>{t('account.dialog.password')}</span>
                  <input
                    className={f.control}
                    type="password"
                    autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                    required
                    minLength={mode === 'signUp' ? MIN_PASSWORD : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {mode === 'signUp' && <small>{t('account.dialog.passwordHint')}</small>}
                </label>
                {error && (
                  <p className={s.error} role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" variant="accent" className={s.wide} disabled={busy}>
                  {mode === 'signIn' ? t('account.dialog.submitSignIn') : t('account.dialog.submitSignUp')}
                </Button>
              </form>

              <button
                type="button"
                className={s.link}
                disabled={busy}
                onClick={() => {
                  if (!email.trim()) {
                    setError(t('account.dialog.errors.email'))
                    return
                  }
                  void run(() => sendMagicLink(email.trim()))
                }}
              >
                <MailRegular /> {t('account.dialog.magicLink')}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

/** Google's "G", drawn inline so no external asset is needed. */
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
