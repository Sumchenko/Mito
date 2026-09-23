import {
  Next16Filled,
  Pause16Filled,
  Play16Filled,
  Stop16Filled,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useTask } from '@/data'
import { formatClock } from './engine'
import { useTimerView } from './hooks'
import { timer } from './store'
import s from './timer.module.css'

/** Title-bar timer: always visible, one click to start, pause, resume or finish. */
export function MiniTimer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const view = useTimerView()
  const task = useTask(view.taskId)
  const { kind } = view.phase

  const label =
    kind === 'break'
      ? t(view.phase.kind === 'break' && view.phase.long ? 'timer.phase.longBreak' : 'timer.phase.break')
      : (task?.title ?? (kind === 'idle' ? t('timer.pickTask') : t('timer.noTask')))

  return (
    <div className={s.mini} data-phase={kind}>
      <button
        type="button"
        className={s.miniInfo}
        onClick={() => navigate('/focus')}
        title={t('timer.title')}
      >
        <span className={s.miniDot} />
        <span className={s.miniClock}>{formatClock(view.ms)}</span>
        <span className={s.miniTask}>{label}</span>
      </button>

      {(kind === 'break' || kind === 'breakOver') && (
        <button
          type="button"
          className={s.miniButton}
          aria-label={t('timer.nextFocus')}
          title={t('timer.nextFocus')}
          onClick={() => void timer.skipBreak()}
        >
          <Next16Filled />
        </button>
      )}
      {kind === 'running' && (
        <button
          type="button"
          className={s.miniButton}
          aria-label={t('timer.pause')}
          title={t('timer.pause')}
          onClick={() => void timer.pause()}
        >
          <Pause16Filled />
        </button>
      )}
      {(kind === 'idle' || kind === 'paused') && (
        <button
          type="button"
          className={s.miniButton}
          data-primary
          aria-label={kind === 'paused' ? t('timer.resume') : t('timer.start')}
          title={kind === 'paused' ? t('timer.resume') : t('timer.start')}
          onClick={() => void (kind === 'paused' ? timer.resume() : timer.start(view.taskId))}
        >
          <Play16Filled />
        </button>
      )}
      {kind !== 'idle' && (
        <button
          type="button"
          className={s.miniButton}
          aria-label={t('timer.stop')}
          title={t('timer.stop')}
          onClick={() => void timer.stop()}
        >
          <Stop16Filled />
        </button>
      )}
    </div>
  )
}
