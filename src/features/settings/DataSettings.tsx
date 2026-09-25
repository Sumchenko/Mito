import {
  ArrowDownload20Regular,
  ArrowUpload20Regular,
  Beaker20Regular,
  Delete20Regular,
} from '@fluentui/react-icons'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearAllData, DomainError, exportBackup, restoreBackup, toLocalDate } from '@/data'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { SettingRow } from '@/ui/SettingRow'
import { useSync } from '@/sync/controller'
import s from './SettingsPage.module.css'

type Pending = 'import' | 'wipe' | 'seed' | null
type Status = { kind: 'ok' | 'error'; text: string } | null

export function DataSettings() {
  const { t } = useTranslation()
  const syncStatus = useSync((st) => st.status)
  const signedIn = syncStatus !== 'guest' && syncStatus !== 'disabled'
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>(null)

  const fail = (error: unknown) => {
    const code = error instanceof DomainError ? error.code : 'unknown'
    setStatus({ kind: 'error', text: t(`errors.${code}`) })
  }

  const onExport = async () => {
    try {
      const backup = await exportBackup()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mito-backup-${toLocalDate()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setStatus({ kind: 'ok', text: t('settings.exportDone') })
    } catch (error) {
      fail(error)
    }
  }

  const onFilePicked = (file: File | undefined) => {
    if (!file) return
    setImportFile(file)
    setPending('import')
  }

  const confirm = async () => {
    const action = pending
    setPending(null)
    try {
      if (action === 'import' && importFile) {
        let parsed: unknown
        try {
          parsed = JSON.parse(await importFile.text())
        } catch {
          throw new DomainError('backup_invalid', 'Not JSON')
        }
        const counts = await restoreBackup(parsed)
        setStatus({ kind: 'ok', text: t('settings.importDone', counts) })
      } else if (action === 'wipe') {
        await clearAllData()
        setStatus({ kind: 'ok', text: t('settings.wipeDone') })
      } else if (action === 'seed') {
        // Loaded on demand so demo content never ships in the main bundle.
        const { seedDemoData } = await import('@/data/seed')
        await seedDemoData()
        setStatus({ kind: 'ok', text: t('settings.seedDone') })
      }
    } catch (error) {
      fail(error)
    } finally {
      setImportFile(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const dialogs = {
    import: ['importConfirmTitle', 'importConfirmText', 'importConfirm'],
    wipe: ['wipeConfirmTitle', 'wipeConfirmText', 'wipeConfirm'],
    seed: ['seedConfirmTitle', 'seedConfirmText', 'seedButton'],
  } as const
  const dialog = pending ? dialogs[pending] : dialogs.import

  return (
    <>
      <h2 className={s.section}>{t('settings.data')}</h2>
      <p className={s.sectionHint}>{t(signedIn ? 'settings.dataHintSynced' : 'settings.dataHint')}</p>

      <SettingRow
        icon={<ArrowDownload20Regular />}
        title={t('settings.export')}
        description={t('settings.exportHint')}
      >
        <Button onClick={onExport}>{t('settings.exportButton')}</Button>
      </SettingRow>
      <SettingRow
        icon={<ArrowUpload20Regular />}
        title={t('settings.import')}
        description={t('settings.importHint')}
      >
        <Button onClick={() => fileInput.current?.click()}>{t('settings.importButton')}</Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => onFilePicked(e.target.files?.[0])}
        />
      </SettingRow>
      {import.meta.env.DEV && (
        <SettingRow
          icon={<Beaker20Regular />}
          title={t('settings.seed')}
          description={t('settings.seedHint')}
        >
          <Button onClick={() => setPending('seed')}>{t('settings.seedButton')}</Button>
        </SettingRow>
      )}
      <SettingRow
        icon={<Delete20Regular />}
        title={t('settings.wipe')}
        description={t(signedIn ? 'settings.wipeHintSynced' : 'settings.wipeHint')}
      >
        <Button onClick={() => setPending('wipe')}>{t('settings.wipeButton')}</Button>
      </SettingRow>

      {status && (
        <p className={s.status} data-kind={status.kind} role="status">
          {status.text}
        </p>
      )}

      <Dialog
        open={pending !== null}
        title={t(`settings.${dialog[0]}`)}
        primaryLabel={t(`settings.${dialog[2]}`)}
        secondaryLabel={t('settings.cancel')}
        danger={pending !== 'seed'}
        onPrimary={confirm}
        onClose={() => setPending(null)}
      >
        {t(`settings.${dialog[1]}`)}
      </Dialog>
    </>
  )
}
