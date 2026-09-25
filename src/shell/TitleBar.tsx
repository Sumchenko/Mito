import {
  Navigation20Regular,
  Settings20Regular,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useSettings } from '@/app/settings'
import { Button } from '@/ui/Button'
import { SyncIndicator } from '@/features/account/SyncIndicator'
import { MiniTimer } from '@/features/timer/MiniTimer'
import { SearchBox } from './SearchBox'
import s from './TitleBar.module.css'

export function TitleBar({ mobile }: { mobile: boolean }) {
  const { t } = useTranslation()
  const navCollapsed = useSettings((st) => st.navCollapsed)
  const toggleNav = useSettings((st) => st.toggleNav)

  return (
    <header className={s.bar}>
      <div className={s.start}>
        {!mobile && (
          <Button
            variant="subtle"
            iconOnly
            icon={<Navigation20Regular />}
            onClick={toggleNav}
            aria-label={navCollapsed ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!navCollapsed}
          />
        )}
        <img src="/mito.svg" alt="" className={s.logo} />
        <span className={s.name}>Mito</span>
      </div>

      <SearchBox />

      <div className={s.end}>
        <SyncIndicator />
        <MiniTimer />
        {mobile && (
          <Link to="/settings" className={s.settingsLink} aria-label={t('nav.settings')}>
            <Settings20Regular />
          </Link>
        )}
      </div>
    </header>
  )
}
