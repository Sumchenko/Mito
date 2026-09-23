import { useNow } from '@/data'
import { display } from './engine'
import { useTimer } from './store'

/** Everything a timer UI needs, re-rendering every second only while the clock moves. */
export function useTimerView() {
  const state = useTimer((s) => s.timer)
  const config = useTimer((s) => s.config)
  const nextTaskId = useTimer((s) => s.nextTaskId)
  const { phase } = state
  const ticking = phase.kind === 'running' || phase.kind === 'break'
  const now = useNow(ticking ? 1000 : 30_000)
  const shown = display(state, now, config)

  return {
    state,
    config,
    phase,
    now,
    ...shown,
    /** The task the session is about, or the one preselected for the next start. */
    taskId: 'taskId' in phase ? phase.taskId : nextTaskId,
    running: phase.kind === 'running',
    active: phase.kind !== 'idle',
  }
}

/** Whether the timer is currently tracking this task. */
export const useIsTracking = (taskId: string) =>
  useTimer((s) => s.timer.phase.kind === 'running' && s.timer.phase.taskId === taskId)
