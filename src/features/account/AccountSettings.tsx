import { ArrowSyncRegular, CloudOffRegular, PersonCircleRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { signOutAndForget, syncNow, useSync } from '@/sync/controller'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { SettingRow } from '@/ui/SettingRow'
import { openAuthDialog } from './authDialogStore'
import { useSyncText } from './useSyncText'
import s from './account.module.css'

/** Settings → Account: a guest is invited to sign in; a user sees sync state and can sign out. */
export function AccountSettings({ sectionClass }: { sectionClass?: string }) {
  const { t } = useTranslation()
  const email = useSync((st) => st.email)
  const { status, pending, text } = useSyncText()
  const [confirm, setConfirm] = useState(false)

  if (status === 'disabled') return null

  return (
    <>
      <h2 className={sectionClass}>{t('account.section')}</h2>
      {status === 'guest' ? (
        <div className={s.guest}>
          <span className={s.guestIcon}>
            <CloudOffRegular />
          </span>
          <div className={s.guestText}>
            <b>{t('account.guestTitle')}</b>
            <p>{t('account.guestText')}</p>
            <div className={s.guestActions}>
              <Button variant="accent" onClick={() => openAuthDialog('signIn')}>
                {t('account.signIn')}
              </Button>
              <Button onClick={() => openAuthDialog('signUp')}>{t('account.signUp')}</Button>
            </div>
          </div>
        </div>
      ) : (
        <SettingRow icon={<PersonCircleRegular />} title={email ?? ''} description={text}>
          <div className={s.rowActions}>
            <Button
              variant="subtle"
              icon={<ArrowSyncRegular className={status === 'syncing' ? s.spin : undefined} />}
              disabled={status === 'syncing'}
              onClick={syncNow}
            >
              {t('account.syncNow')}
            </Button>
            <Button onClick={() => setConfirm(true)}>{t('account.signOut')}</Button>
          </div>
        </SettingRow>
      )}

      <Dialog
        open={confirm}
        title={t('account.signOutTitle')}
        primaryLabel={t('account.signOut')}
        secondaryLabel={t('common.cancel')}
        danger={pending > 0 && !navigator.onLine}
        onPrimary={() => {
          setConfirm(false)
          void signOutAndForget()
        }}
        onClose={() => setConfirm(false)}
      >
        <p>{t('account.signOutText')}</p>
        {pending > 0 && !navigator.onLine && <p className={s.warn}>{t('account.signOutPending', { count: pending })}</p>}
      </Dialog>
    </>
  )
}
