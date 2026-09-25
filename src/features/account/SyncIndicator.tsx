import {
  ArrowSyncRegular,
  CloudCheckmarkRegular,
  CloudDismissRegular,
  CloudOffRegular,
} from '@fluentui/react-icons'
import { useNavigate } from 'react-router'
import { openAuthDialog } from './authDialogStore'
import { useSyncText } from './useSyncText'
import s from './account.module.css'

/**
 * Cloud in the title bar. For a guest it is a quiet invitation to sign in; for a user it
 * shows whether the data is safely synced.
 */
export function SyncIndicator() {
  const navigate = useNavigate()
  const { status, text } = useSyncText()
  if (status === 'disabled') return null

  const icon =
    status === 'syncing' ? (
      <ArrowSyncRegular className={s.spin} />
    ) : status === 'synced' ? (
      <CloudCheckmarkRegular />
    ) : status === 'error' ? (
      <CloudDismissRegular />
    ) : (
      <CloudOffRegular />
    )

  return (
    <button
      type="button"
      className={s.indicator}
      data-status={status}
      title={text}
      aria-label={text}
      onClick={() => (status === 'guest' ? openAuthDialog('signIn') : navigate('/settings'))}
    >
      {icon}
      {status === 'guest' && <i className={s.dot} />}
    </button>
  )
}
