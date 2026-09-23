import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useRunningEntry, useTask } from '@/data'
import { formatClock } from './engine'
import { useTimerView } from './hooks'
import { timer } from './store'

/**
 * Invisible, always mounted: advances Pomodoro phases, keeps UI state in line with the
 * database, and mirrors the clock in the browser tab title.
 */
export function TimerController() {
  const { t } = useTranslation()
  const running = useRunningEntry()
  const view = useTimerView()
  const task = useTask(view.phase.kind === 'running' ? view.taskId : undefined)

  useEffect(() => {
    if (running !== undefined) timer.reconcile(running ?? undefined)
  }, [running])

  // Catch up immediately on load (the app may have been closed mid-phase), then every second.
  useEffect(() => {
    void timer.tick()
    const id = setInterval(() => void timer.tick(), 1000)
    return () => clearInterval(id)
  }, [])

  const { kind } = view.phase
  const title =
    kind === 'running'
      ? `${formatClock(view.ms)} · ${task?.title ?? t('timer.noTask')} — Mito`
      : kind === 'break'
        ? `${formatClock(view.ms)} · ${t('timer.phase.break')} — Mito`
        : kind === 'paused'
          ? `${t('timer.phase.paused')} — Mito`
          : 'Mito'
  useEffect(() => {
    document.title = title
  }, [title])

  return null
}
