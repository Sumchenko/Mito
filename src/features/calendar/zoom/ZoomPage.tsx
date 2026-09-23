import { ArrowLeft20Regular } from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { pageTransition } from '@/design/motion'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Segmented'
import { STOPS, type Stop } from './camera'
import { ZoomCalendar, type ZoomApi } from './ZoomCalendar'
import s from '../calendar.module.css'
import z from './zoom.module.css'

const STOP_LIST = Object.keys(STOPS) as Stop[]

/** Stage 5 prototype: the semantic zoom surface on real data, before it replaces the grid. */
export function ZoomPage() {
  const { t } = useTranslation()
  const [api, setApi] = useState<ZoomApi | null>(null)
  const [nearest, setNearest] = useState<Stop>('week')

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.toolbar}>
        <div className={s.nav}>
          <Link to="/calendar" aria-label={t('calendar.zoom.back')}>
            <Button variant="subtle" iconOnly icon={<ArrowLeft20Regular />} aria-label={t('calendar.zoom.back')} />
          </Link>
          <Button onClick={() => api?.today()}>{t('calendar.today')}</Button>
          <h1 className={s.title}>{t('calendar.zoom.title')}</h1>
          <span className={z.hint}>{t('calendar.zoom.hint')}</span>
        </div>
        <Segmented<Stop>
          aria-label={t('calendar.zoom.title')}
          value={nearest}
          options={STOP_LIST.map((stop) => ({ value: stop, label: t(`calendar.zoom.stops.${stop}`) }))}
          onChange={(stop) => api?.goToStop(stop)}
        />
      </header>
      <div className={s.card} style={{ flex: 1, minHeight: 0 }}>
        <ZoomCalendar onApi={setApi} onStop={setNearest} />
      </div>
    </motion.div>
  )
}
