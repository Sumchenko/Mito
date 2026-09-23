import { Pause16Filled, Play16Filled } from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { cx } from '@/lib/cx'
import { formatClock } from './engine'
import { useIsTracking, useTimerView } from './hooks'
import { timer } from './store'
import s from './timer.module.css'

/** Play/pause for one task. Starting another task switches the running session to it. */
export function TaskTimerButton({ taskId, className }: { taskId: string; className?: string }) {
  const { t } = useTranslation()
  const tracking = useIsTracking(taskId)
  return (
    <button
      type="button"
      className={cx(s.taskPlay, className)}
      data-tracking={tracking}
      aria-label={tracking ? t('timer.pauseTask') : t('timer.startTask')}
      title={tracking ? t('timer.pauseTask') : t('timer.startTask')}
      onClick={(e) => {
        e.stopPropagation()
        void timer.toggleTask(taskId)
      }}
    >
      {tracking ? <Pause16Filled /> : <Play16Filled />}
    </button>
  )
}

/** Live "● 12:34" badge for the task currently being tracked. */
export function RunningBadge() {
  const view = useTimerView()
  return (
    <span className={s.runningBadge}>
      <span className={s.pulse} />
      {formatClock(view.ms)}
    </span>
  )
}
