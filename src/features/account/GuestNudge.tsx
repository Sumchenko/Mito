import { CloudOffRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSync } from '@/sync/controller'
import { Button } from '@/ui/Button'
import { openAuthDialog } from './authDialogStore'
import s from './account.module.css'

const KEY = 'mito.guestNudge'
/** "Later" hides the nudge for a week. */
const SNOOZE = 7 * 24 * 3_600_000

const snoozedUntil = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * A gentle reminder for guests with real data: it lives in one browser only. Shown once the
 * user has something to lose, and easy to put off.
 */
export function GuestNudge({ hasData }: { hasData: boolean }) {
  const { t } = useTranslation()
  const status = useSync((st) => st.status)
  const [hidden, setHidden] = useState(() => snoozedUntil() > Date.now())
  if (status !== 'guest' || !hasData || hidden) return null

  return (
    <div className={s.nudge} role="note">
      <CloudOffRegular className={s.nudgeIcon} />
      <p>{t('account.nudge.text')}</p>
      <Button variant="accent" onClick={() => openAuthDialog('signUp')}>
        {t('account.signIn')}
      </Button>
      <Button
        variant="subtle"
        onClick={() => {
          try {
            localStorage.setItem(KEY, String(Date.now() + SNOOZE))
          } catch {
            // Private mode: hide for this session only.
          }
          setHidden(true)
        }}
      >
        {t('account.nudge.later')}
      </Button>
    </div>
  )
}
