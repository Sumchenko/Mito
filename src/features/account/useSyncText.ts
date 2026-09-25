import { useTranslation } from 'react-i18next'
import { useSync } from '@/sync/controller'
import { usePendingCount } from '@/sync/hooks'

/** One line describing the sync state, shared by settings and the title bar. */
export function useSyncText() {
  const { t, i18n } = useTranslation()
  const { status, lastSyncedAt } = useSync()
  const pending = usePendingCount()
  const time = lastSyncedAt
    ? new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(lastSyncedAt)
    : null

  const base =
    status === 'synced'
      ? time
        ? t('account.status.synced', { time })
        : t('account.status.syncedNever')
      : status === 'syncing'
        ? t('account.status.syncing')
        : status === 'offline'
          ? t('account.status.offline')
          : status === 'error'
            ? t('account.status.error')
            : status === 'guest'
              ? t('account.status.guest')
              : ''
  const showPending = pending > 0 && (status === 'offline' || status === 'error')
  return { status, pending, text: showPending ? `${base} · ${t('account.status.pending', { count: pending })}` : base }
}
