import { ReOrderDotsVertical16Regular } from '@fluentui/react-icons'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalDate, Task } from '@/data'
import { formatDay, formatMinutes } from '@/lib/format'
import { draggedTask } from './colors'
import type { CalendarData } from './useCalendarData'
import s from './calendar.module.css'

/**
 * Open tasks planned for the visible days that have no block yet, plus undated ones.
 * Drag one onto the grid to give it time.
 */
export function UnscheduledPanel({ days, today, data }: { days: LocalDate[]; today: LocalDate; data: CalendarData }) {
  const { t, i18n } = useTranslation()

  const { planned, undated } = useMemo(() => {
    const scheduled = new Set(data.blocks.flatMap((b) => (b.taskId ? [b.taskId] : [])))
    const first = days[0]!
    const last = days[days.length - 1]!
    const open = data.tasks.filter((x) => x.status === 'open' && !scheduled.has(x.id))
    // Parents whose subtasks are scheduled are still shown: the parent itself has no time yet.
    return {
      planned: open
        .filter((x) => x.plannedDate && x.plannedDate >= first && x.plannedDate <= last)
        .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!) || a.order - b.order),
      undated: open.filter((x) => !x.plannedDate && !x.parentId).slice(0, 12),
    }
  }, [data.blocks, data.tasks, days])

  const item = (task: Task) => {
    const project = data.projectOf(task)
    return (
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
        <ReOrderDotsVertical16Regular className={s.sideGrip} />
        <span className={s.sideDot} style={{ background: project ? `var(--tint-${project.color})` : 'var(--text-disabled)' }} />
        <span className={s.sideText}>
          <span className={s.sideTitle}>{task.title}</span>
          <span className={s.sideMeta}>
            {days.length > 1 && task.plannedDate && formatDay(task.plannedDate, today, i18n.language, t)}
            {task.estimateMin && ` · ${formatMinutes(task.estimateMin, { h: t('common.h'), min: t('common.min') })}`}
          </span>
        </span>
      </li>
    )
  }

  return (
    <aside className={s.side}>
      <h2 className={s.sideTitleHead}>{t('calendar.unscheduled')}</h2>
      <p className={s.sideHint}>{t('calendar.unscheduledHint')}</p>
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
