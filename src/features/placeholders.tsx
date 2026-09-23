import {
  DataTrending24Regular,
  Sparkle24Regular,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { Page, Upcoming } from '@/ui/Page'

// Temporary pages; each is replaced by its real feature in the matching roadmap stage.

export function StatsPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('pages.stats.title')}>
      <Upcoming icon={<DataTrending24Regular />} text={t('pages.stats.soon')} />
    </Page>
  )
}

export function MentorPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('pages.mentor.title')}>
      <Upcoming icon={<Sparkle24Regular />} text={t('pages.mentor.soon')} />
    </Page>
  )
}
