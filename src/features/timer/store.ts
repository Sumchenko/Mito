import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { timeEntriesRepo, type Id, type TimeEntry } from '@/data'
import * as engine from './engine'
import { chime, notify } from './signals'

export interface TimerStore {
  timer: engine.TimerState
  config: engine.PomodoroConfig
  sound: boolean
  /** Task preselected for the next start when nothing is running. */
  nextTaskId?: Id
}

/**
 * Timer UI state, persisted per device so a reload (or a closed tab) resumes exactly where it
 * was. Tracked time itself lives in the database; see `engine.ts` for the split.
 */
export const useTimer = create<TimerStore>()(
  persist(
    (): TimerStore => ({
      timer: engine.INITIAL_TIMER,
      config: engine.DEFAULT_POMODORO,
      sound: true,
    }),
    { name: 'mito.timer', version: 1 },
  ),
)

// Keep tabs in step: another tab starting or stopping the timer updates this one.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'mito.timer') void useTimer.persist.rehydrate()
  })
}

/** Stops shorter than this are treated as accidental clicks and discarded. */
const MIN_ENTRY_MS = 10_000

let busy = 0
/** True while effects are being written — reconciliation must not act on half-applied state. */
export const isTimerBusy = () => busy > 0

async function applyEffects(effects: engine.Effect[]) {
  busy++
  try {
    for (const effect of effects) {
      if (effect.type === 'startEntry') {
        try {
          await timeEntriesRepo.start({ taskId: effect.taskId, at: effect.at, source: effect.source })
        } catch {
          // The task may have been deleted meanwhile — track the time without it.
          await timeEntriesRepo.start({ at: effect.at, source: effect.source })
        }
      } else if (effect.type === 'stopEntry') {
        const stopped = await timeEntriesRepo.stop(effect.at)
        if (stopped && stopped.end! - stopped.start < MIN_ENTRY_MS) await timeEntriesRepo.remove(stopped.id)
      } else {
        const { sound } = useTimer.getState()
        if (sound) chime(effect.event)
        notify(effect.event)
      }
    }
  } finally {
    busy--
  }
}

async function run(transition: (s: TimerStore) => engine.Transition) {
  const current = useTimer.getState()
  const { state, effects } = transition(current)
  // Unchanged state is returned by reference; skip the write so idle ticks do not touch
  // localStorage (and wake other tabs) every second.
  if (state !== current.timer) useTimer.setState({ timer: state })
  await applyEffects(effects)
}

// ---------- Public actions ----------

export const timer = {
  start: (taskId?: Id) =>
    run((s) => engine.start(s.timer, Date.now(), taskId, s.config)),

  /** Start, or switch the running session to another task. */
  toggleTask: (taskId?: Id) => {
    const { timer: t } = useTimer.getState()
    const active = t.phase.kind === 'running' && t.phase.taskId === taskId
    return active ? timer.pause() : timer.start(taskId)
  },

  pause: () => run((s) => engine.pause(s.timer, Date.now())),
  resume: () => run((s) => engine.resume(s.timer, Date.now(), s.config)),
  stop: () => run((s) => engine.stop(s.timer, Date.now())),
  skipBreak: () => run((s) => engine.skipBreak(s.timer, Date.now(), s.config)),
  tick: () => run((s) => engine.tick(s.timer, Date.now(), s.config)),

  setMode: (mode: engine.TimerMode) =>
    useTimer.setState((s) => ({ timer: engine.setMode(s.timer, mode) })),
  setConfig: (patch: Partial<engine.PomodoroConfig>) =>
    useTimer.setState((s) => ({ config: { ...s.config, ...patch } })),
  setSound: (sound: boolean) => useTimer.setState({ sound }),
  setNextTask: (nextTaskId?: Id) => useTimer.setState({ nextTaskId }),

  /**
   * Aligns the UI state with the database when they disagree — e.g. the running task was
   * deleted (the repository stopped its entry) or state was lost while an entry kept running.
   */
  reconcile: (running: TimeEntry | undefined) => {
    if (isTimerBusy()) return
    const { timer: t } = useTimer.getState()
    if (running && t.phase.kind !== 'running') {
      useTimer.setState({
        timer: { ...t, phase: { kind: 'running', taskId: running.taskId, startedAt: running.start } },
      })
    } else if (!running && t.phase.kind === 'running') {
      useTimer.setState({ timer: { ...t, phase: { kind: 'idle' }, cycles: 0 } })
    } else if (running && t.phase.kind === 'running' && running.taskId !== t.phase.taskId) {
      useTimer.setState({ timer: { ...t, phase: { ...t.phase, taskId: running.taskId } } })
    }
  },
}

