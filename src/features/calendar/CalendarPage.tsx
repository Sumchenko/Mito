import {
  CalendarTodayRegular,
  ChevronLeft20Regular,
  ChevronRight20Regular,
  ColumnDoubleCompareRegular,
  DismissRegular,
  TaskListSquareLtrRegular,
} from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isLocalDate, toLocalDate, type LocalDate, type Task } from '@/data'
import { pageTransition } from '@/design/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { Button } from '@/ui/Button'
import { Popover } from '@/ui/Popover'
import { Segmented } from '@/ui/Segmented'
import { useUnscheduled } from './unscheduled'
import { UnscheduledPanel } from './UnscheduledPanel'
import { dayToCell, STOPS, type Stop } from './zoom/camera'
import { useZoomData } from './zoom/useZoomData'
import { ZoomCalendar, type ZoomApi, type ZoomView } from './zoom/ZoomCalendar'
import s from './calendar.module.css'

const STOP_LIST = Object.keys(STOPS) as Stop[]
const isStop = (v: string | null): v is Stop => v !== null && v in STOPS

/** Remembered zoom level and fact layout; the date lives in the URL (?date=&view=). */
interface CalendarPrefs {
  stop: Stop
  factOpen: boolean
}
const useCalendarPrefs = create<CalendarPrefs>()(
  persist((): CalendarPrefs => ({ stop: 'week', factOpen: false }), { name: 'mito.calendar', version: 2 }),
)
const toggleFact = () => useCalendarPrefs.setState((st) => ({ factOpen: !st.factOpen }))

/**
 * The calendar is one semantic-zoom surface: from a single day with editable blocks out to a
 * whole year of heat cells. The toolbar names the stops; the camera can rest anywhere between.
 */
export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const [params, setParams] = useSearchParams()
  const narrow = useMediaQuery('(max-width: 640px)')
  // Below this the side panel does not fit next to the calendar (matches calendar.module.css).
  const compact = useMediaQuery('(max-width: 1100px)')
  const today = toLocalDate()
  const savedStop = useCalendarPrefs((st) => st.stop)
  const factOpen = useCalendarPrefs((st) => st.factOpen)

  // Read the URL once: afterwards the camera is the source of truth and writes back.
  const [initial] = useState(() => {
    const date = params.get('date')
    const view = params.get('view')
    return {
      day: isLocalDate(date) ? date : today,
      stop: isStop(view) ? view : narrow ? ('day' as Stop) : savedStop,
    }
  })
  const [api, setApi] = useState<ZoomApi | null>(null)
  const [view, setView] = useState<ZoomView>({ stop: initial.stop, center: initial.day, days: [initial.day] })

  const onView = useCallback(
    (next: ZoomView) => {
      setView(next)
      useCalendarPrefs.setState({ stop: next.stop })
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          p.set('date', next.center)
          p.set('view', next.stop)
          return p
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // T — today, F — plan & fact, PageUp/PageDown — previous/next period (arrows move the camera).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 't' || e.key === 'е') api?.today()
      else if (e.key === 'f' || e.key === 'а') toggleFact()
      else if (e.key === 'PageUp') api?.step(-1)
      else if (e.key === 'PageDown') api?.step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [api])

  const title = useMemo(() => {
    const date = (d: LocalDate) => new Date(`${d}T12:00`)
    const f = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(i18n.language, o)
    const center = date(view.center)
    switch (view.stop) {
      case 'day':
        // A phone has room for "Sun, 27 Sep", not "Sunday, 27 September".
        return f(center, narrow ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' })
      case 'year':
        return String(center.getFullYear())
      case 'month':
        return f(center, { month: 'long', year: 'numeric' })
      default: {
        const first = date(view.days[0]!)
        const last = date(view.days[view.days.length - 1]!)
        const sameMonth = first.getMonth() === last.getMonth()
        const from = f(first, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
        const to = f(last, narrow ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'long', year: 'numeric' })
        return `${from} – ${to}`
      }
    }
  }, [view, i18n.language, narrow])

  // The side panel works on what is on screen; its query shares the calendar's cached range.
  const rows = view.days.map((d) => dayToCell(d).row)
  const lookup = useZoomData(Math.min(...rows), Math.max(...rows), t('calendar.noTask'))
  const unscheduled = useUnscheduled(view.days, lookup)

  // Where the side panel does not fit, it opens from a toolbar button; a picked task is then
  // placed by tapping the calendar (touch screens have no drag and drop).
  const [listAt, setListAt] = useState<DOMRect | null>(null)
  const [placing, setPlacing] = useState<Task | null>(null)
  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPlacing(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

  const stops = (
    <Segmented<Stop>
      aria-label={t('nav.calendar')}
      value={view.stop}
      options={STOP_LIST.map((st) => ({ value: st, label: t(`calendar.zoom.stops.${st}`) }))}
      onChange={(st) => api?.goToStop(st)}
    />
  )

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.toolbar}>
        <div className={s.nav}>
          {!narrow && <Button onClick={() => api?.today()}>{t('calendar.today')}</Button>}
          <Button
            variant="subtle"
            iconOnly
            icon={<ChevronLeft20Regular />}
            aria-label={t('calendar.prev')}
            onClick={() => api?.step(-1)}
          />
          {narrow && <h1 className={s.title}>{title}</h1>}
          <Button
            variant="subtle"
            iconOnly
            icon={<ChevronRight20Regular />}
            aria-label={t('calendar.next')}
            onClick={() => api?.step(1)}
          />
          {!narrow && <h1 className={s.title}>{title}</h1>}
        </div>
        <div className={s.tools}>
          {narrow && (
            <Button
              variant="subtle"
              iconOnly
              icon={<CalendarTodayRegular />}
              aria-label={t('calendar.today')}
              title={t('calendar.today')}
              onClick={() => api?.today()}
            />
          )}
          {compact && (
            <Button
              variant="subtle"
              iconOnly
              icon={<TaskListSquareLtrRegular />}
              className={s.listButton}
              aria-label={t('calendar.unscheduled')}
              onClick={(e) => setListAt(e.currentTarget.getBoundingClientRect())}
            >
              {unscheduled.count > 0 && <span className={`${s.badge} ${s.badgeCorner}`}>{unscheduled.count}</span>}
            </Button>
          )}
          {/* Plan and fact side by side needs a wide day column: not on phones. */}
          {!narrow && (
            <Button
              variant="subtle"
              icon={<ColumnDoubleCompareRegular />}
              className={s.factToggle}
              aria-pressed={factOpen}
              title={t('calendar.planFactHint')}
              onClick={toggleFact}
            >
              {t('calendar.planFact')}
            </Button>
          )}
          {!compact && stops}
        </div>
      </header>
      {/* Where the toolbar is tight the stops get a row of their own. */}
      {compact && <div className={s.stopsRow}>{stops}</div>}

      {placing && (
        <div className={s.placing} role="status">
          <span>{t('calendar.placing', { title: placing.title })}</span>
          <Button variant="subtle" iconOnly icon={<DismissRegular />} aria-label={t('common.cancel')} onClick={() => setPlacing(null)} />
        </div>
      )}

      <div className={s.layout}>
        <div className={s.card}>
          <ZoomCalendar
            initial={initial}
            factOpen={factOpen && !narrow}
            placing={placing}
            onPlaced={() => setPlacing(null)}
            onApi={setApi}
            onView={onView}
          />
        </div>
        {!compact && <UnscheduledPanel days={view.days} today={today} data={lookup} />}
      </div>

      {listAt && (
        <Popover anchor={listAt} onClose={() => setListAt(null)} width={300} label={t('calendar.unscheduled')}>
          <UnscheduledPanel
            days={view.days}
            today={today}
            data={lookup}
            onPick={(task) => {
              setListAt(null)
              setPlacing(task)
            }}
          />
        </Popover>
      )}
    </motion.div>
  )
}
