import { ReOrderDotsVertical16Regular } from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import type { LocalDate, Task } from '@/data'
import { cx } from '@/lib/cx'
import { formatDay, formatMinutes } from '@/lib/format'
import { draggedTask } from './colors'
import { useUnscheduled } from './unscheduled'
import type { CalendarLookup } from './zoom/useZoomData'
import s from './calendar.module.css'

interface UnscheduledPanelProps {
  days: LocalDate[]
  today: LocalDate
  data: CalendarLookup
  /**
   * Touch screens have no drag and drop: when given, a tap picks the task instead, and the
   * calendar then places it where the user taps next. Also renders as a plain list (for a sheet).
   */
  onPick?: (task: Task) => void
}

/**
 * Open tasks planned for the visible days that have no block yet, plus undated ones.
 * Drag one onto the grid to give it time — or, on touch, tap it and then tap the time.
 */
export function UnscheduledPanel({ days, today, data, onPick }: UnscheduledPanelProps) {
  const { t, i18n } = useTranslation()
  const { planned, undated } = useUnscheduled(days, data)

  const item = (task: Task) => {
    const project = data.projectOf(task)
    const body = (
      <>
        {!onPick && <ReOrderDotsVertical16Regular className={s.sideGrip} />}
        <span className={s.sideDot} style={{ background: project ? `var(--tint-${project.color})` : 'var(--accent)' }} />
        <span className={s.sideText}>
          <span className={s.sideTitle}>{task.title}</span>
          <span className={s.sideMeta}>
            {days.length > 1 && task.plannedDate && formatDay(task.plannedDate, today, i18n.language, t)}
            {task.estimateMin && ` · ${formatMinutes(task.estimateMin, { h: t('common.h'), min: t('common.min') })}`}
          </span>
        </span>
      </>
    )
    return onPick ? (
      <li key={task.id}>
        <button type="button" className={cx(s.sideItem, s.sidePick)} onClick={() => onPick(task)}>
          {body}
        </button>
      </li>
    ) : (
      <li
        key={task.id}
        className={s.sideItem}
        draggable
        onDragStart={(e) => {
          draggedTask.current = task
          e.dataTransfer.effectAllowed = 'copy'
          e.dataTransfer.setData('text/plain', task.title)
        }}
        onDragEnd={() => (draggedTask.current = null)}
      >
        {body}
      </li>
    )
  }

  return (
    <aside className={onPick ? s.sideSheet : s.side}>
      <h2 className={s.sideTitleHead}>{t('calendar.unscheduled')}</h2>
      <p className={s.sideHint}>{onPick ? t('calendar.unscheduledTapHint') : t('calendar.unscheduledHint')}</p>
      {planned.length === 0 && <p className={s.sideEmpty}>{t('calendar.unscheduledEmpty')}</p>}
      <ul className={s.sideList}>{planned.map(item)}</ul>
      {undated.length > 0 && (
        <>
          <h3 className={s.sideGroup}>{t('tasks.lists.inbox')}</h3>
          <ul className={s.sideList}>{undated.map(item)}</ul>
        </>
      )}
    </aside>
  )
}
