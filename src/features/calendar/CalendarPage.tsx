import { ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addDays, isLocalDate, toLocalDate, useNow, type LocalDate } from '@/data'
import { pageTransition } from '@/design/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Segmented'
import { CalendarGrid } from './CalendarGrid'
import { daysFrom, VIEW_DAYS, viewStart, type CalendarView } from './geometry'
import { UnscheduledPanel } from './UnscheduledPanel'
import { useCalendarData } from './useCalendarData'
import s from './calendar.module.css'

/** Remembered view preference; the date itself lives in the URL (?date=&view=). */
const useCalendarPrefs = create<{ view: CalendarView }>()(
  persist(() => ({ view: 'week' as CalendarView }), { name: 'mito.calendar', version: 1 }),
)

const HOUR_PX: Record<CalendarView, number> = { day: 64, '3days': 56, week: 48 }

export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const narrow = useMediaQuery('(max-width: 640px)')
  const now = useNow(30_000)
  const today = toLocalDate(now)

  const saved = useCalendarPrefs((st) => st.view)
  const urlView = params.get('view')
  const view: CalendarView = narrow ? 'day' : urlView && urlView in VIEW_DAYS ? (urlView as CalendarView) : saved
  const urlDate = params.get('date')
  const focus: LocalDate = isLocalDate(urlDate) ? urlDate : today

  const days = useMemo(() => daysFrom(viewStart(view, focus), VIEW_DAYS[view]), [view, focus])
  const data = useCalendarData(days)

  const go = useCallback(
    (next: { date?: LocalDate; view?: CalendarView }) => {
      if (next.view) useCalendarPrefs.setState({ view: next.view })
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next.date) p.set('date', next.date)
          if (next.view) p.set('view', next.view)
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const step = (dir: 1 | -1) => go({ date: addDays(focus, dir * VIEW_DAYS[view]) })

  // T — today, ← → — previous/next period.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 't' || e.key === 'е') go({ date: today })
      else if (e.key === 'ArrowLeft') go({ date: addDays(focus, -VIEW_DAYS[view]) })
      else if (e.key === 'ArrowRight') go({ date: addDays(focus, VIEW_DAYS[view]) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, focus, view, today])

  const title = useMemo(() => {
    const first = new Date(`${days[0]}T12:00`)
    const last = new Date(`${days[days.length - 1]}T12:00`)
    if (days.length === 1) {
      return first.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    }
    const sameMonth = first.getMonth() === last.getMonth()
    const from = first.toLocaleDateString(i18n.language, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
    const to = last.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
    return `${from} – ${to}`
  }, [days, i18n.language])

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.toolbar}>
        <div className={s.nav}>
          <Button onClick={() => go({ date: today })} disabled={days.includes(today)}>
            {t('calendar.today')}
          </Button>
          <Button variant="subtle" iconOnly icon={<ChevronLeft20Regular />} aria-label={t('calendar.prev')} onClick={() => step(-1)} />
          <Button variant="subtle" iconOnly icon={<ChevronRight20Regular />} aria-label={t('calendar.next')} onClick={() => step(1)} />
          <h1 className={s.title}>{title}</h1>
        </div>
        <Link to="/calendar/zoom" className={s.zoomLink}>
          {t('calendar.zoom.open')}
        </Link>
        {!narrow && (
          <Segmented<CalendarView>
            aria-label={t('nav.calendar')}
            value={view}
            options={(['day', '3days', 'week'] as const).map((v) => ({ value: v, label: t(`calendar.views.${v}`) }))}
            onChange={(v) => go({ view: v })}
          />
        )}
      </header>

      <div className={s.layout}>
        <div className={s.card}>
          <CalendarGrid
            days={days}
            hourPx={HOUR_PX[view]}
            data={data}
            today={today}
            now={now}
            onDayClick={(day) => go({ date: day, view: 'day' })}
          />
        </div>
        <UnscheduledPanel days={days} today={today} data={data} />
      </div>
    </motion.div>
  )
}
