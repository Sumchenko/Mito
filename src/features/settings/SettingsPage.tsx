import {
  DarkTheme20Regular,
  LocalLanguage20Regular,
  PaintBrush20Regular,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { useSettings, type StylePreference, type ThemePreference } from '@/app/settings'
import type { Language } from '@/i18n'
import { Page } from '@/ui/Page'
import { Segmented } from '@/ui/Segmented'
import { SettingRow } from '@/ui/SettingRow'
import { DataSettings } from './DataSettings'
import s from './SettingsPage.module.css'

export function SettingsPage() {
  const { t } = useTranslation()
  const { theme, style, language, setTheme, setStyle, setLanguage } = useSettings()

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('settings.themeSystem') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ]
  const styleOptions: { value: StylePreference; label: string }[] = [
    { value: 'airy', label: t('settings.styleAiry') },
    { value: 'strict', label: t('settings.styleStrict') },
  ]
  const languageOptions: { value: Language; label: string }[] = [
    { value: 'ru', label: 'Русский' },
    { value: 'en', label: 'English' },
  ]

  return (
    <Page title={t('settings.title')}>
      <h2 className={s.section}>{t('settings.appearance')}</h2>
      <SettingRow
        icon={<PaintBrush20Regular />}
        title={t('settings.style')}
        description={t('settings.styleHint')}
      >
        <Segmented
          aria-label={t('settings.style')}
          value={style}
          options={styleOptions}
          onChange={setStyle}
        />
      </SettingRow>
      <SettingRow
        icon={<DarkTheme20Regular />}
        title={t('settings.theme')}
        description={t('settings.themeHint')}
      >
        <Segmented
          aria-label={t('settings.theme')}
          value={theme}
          options={themeOptions}
          onChange={setTheme}
        />
      </SettingRow>
      <SettingRow
        icon={<LocalLanguage20Regular />}
        title={t('settings.language')}
        description={t('settings.languageHint')}
      >
        <Segmented
          aria-label={t('settings.language')}
          value={language}
          options={languageOptions}
          onChange={setLanguage}
        />
      </SettingRow>
      <DataSettings />
    </Page>
  )
}
