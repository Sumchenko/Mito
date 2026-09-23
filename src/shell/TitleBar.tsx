import {
  Navigation20Regular,
  Play16Filled,
  Search16Regular,
  Settings20Regular,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useSettings } from '@/app/settings'
import { Button } from '@/ui/Button'
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

      {/* Search wiring lands with tasks in stage 2. */}
      <label className={s.search}>
        <Search16Regular className={s.searchIcon} />
        <input type="search" placeholder={t('titlebar.search')} disabled />
        <kbd className={s.kbd}>Ctrl K</kbd>
      </label>

      <div className={s.end}>
        {/* Mini timer: becomes live in stage 3. */}
        <div className={s.timer} title={t('titlebar.timerIdle')}>
          <span className={s.timerDot} />
          <span className="tabular">0:00:00</span>
          <button type="button" className={s.timerButton} disabled aria-label="Start">
            <Play16Filled />
          </button>
        </div>
        {mobile && (
          <Link to="/settings" className={s.settingsLink} aria-label={t('nav.settings')}>
            <Settings20Regular />
          </Link>
        )}
      </div>
    </header>
  )
}
