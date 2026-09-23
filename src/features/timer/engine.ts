import type { Id, Timestamp } from '@/data'

/*
 * Timer engine — pure state transitions, no I/O. The running TimeEntry in the database is the
 * source of truth for tracked time; this state only holds what the database cannot know:
 * the timer mode, where a Pomodoro cycle is, and what to resume after a pause.
 */

export type TimerMode = 'stopwatch' | 'pomodoro'

export interface PomodoroConfig {
  focusMin: number
  shortBreakMin: number
  longBreakMin: number
  /** A long break follows every N focus sessions. */
  longEvery: number
  autoStartBreak: boolean
  autoStartFocus: boolean
}

export const DEFAULT_POMODORO: PomodoroConfig = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  longEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
}

export type Phase =
  | { kind: 'idle' }
  /** Time is being tracked. For Pomodoro, the focus ends at `startedAt + durationMs`. */
  | { kind: 'running'; taskId?: Id; startedAt: Timestamp; durationMs?: number }
  /** Paused: nothing is tracked. `remainingMs` resumes a Pomodoro focus where it stopped. */
  | { kind: 'paused'; taskId?: Id; remainingMs?: number }
  | { kind: 'break'; long: boolean; endsAt: Timestamp; taskId?: Id }
  /** The break is over; waiting for the user to start the next focus. */
  | { kind: 'breakOver'; taskId?: Id }

export interface TimerState {
  mode: TimerMode
  phase: Phase
  /** Focus sessions completed in the current Pomodoro set. */
  cycles: number
}

export const INITIAL_TIMER: TimerState = { mode: 'stopwatch', phase: { kind: 'idle' }, cycles: 0 }

/** Side effects the caller must perform, in order. */
export type Effect =
  | { type: 'startEntry'; taskId?: Id; at: Timestamp; source: 'timer' | 'pomodoro' }
  | { type: 'stopEntry'; at: Timestamp }
  | { type: 'notify'; event: 'focusDone' | 'breakDone' }

export interface Transition {
  state: TimerState
  effects: Effect[]
}

const MIN = 60_000

const focusMs = (c: PomodoroConfig) => c.focusMin * MIN

function startFocus(state: TimerState, at: Timestamp, taskId: Id | undefined, c: PomodoroConfig, durationMs = focusMs(c)): Transition {
  const pomodoro = state.mode === 'pomodoro'
  return {
    state: {
      ...state,
      phase: { kind: 'running', taskId, startedAt: at, ...(pomodoro ? { durationMs } : {}) },
    },
    effects: [{ type: 'startEntry', taskId, at, source: pomodoro ? 'pomodoro' : 'timer' }],
  }
}

export function start(state: TimerState, at: Timestamp, taskId: Id | undefined, c: PomodoroConfig): Transition {
  const { phase } = state
  // Resuming a paused Pomodoro keeps the remaining focus time.
  if (phase.kind === 'paused' && state.mode === 'pomodoro' && phase.remainingMs) {
    return startFocus(state, at, taskId, c, phase.remainingMs)
  }
  // Switching task mid-session: keep the Pomodoro clock, only the tracked entry changes.
  if (phase.kind === 'running') {
    return {
      state: { ...state, phase: { ...phase, taskId } },
      effects: [{ type: 'startEntry', taskId, at, source: state.mode === 'pomodoro' ? 'pomodoro' : 'timer' }],
    }
  }
  return startFocus(state, at, taskId, c)
}

export function pause(state: TimerState, at: Timestamp): Transition {
  const { phase } = state
  if (phase.kind !== 'running') return { state, effects: [] }
  const remainingMs =
    phase.durationMs !== undefined ? Math.max(0, phase.durationMs - (at - phase.startedAt)) : undefined
  return {
    state: { ...state, phase: { kind: 'paused', taskId: phase.taskId, remainingMs } },
    effects: [{ type: 'stopEntry', at }],
  }
}

export function resume(state: TimerState, at: Timestamp, c: PomodoroConfig): Transition {
  const { phase } = state
  if (phase.kind !== 'paused') return { state, effects: [] }
  return start(state, at, phase.taskId, c)
}

/** Ends the session entirely, including any break, and resets the Pomodoro set. */
export function stop(state: TimerState, at: Timestamp): Transition {
  const effects: Effect[] = state.phase.kind === 'running' ? [{ type: 'stopEntry', at }] : []
  return { state: { ...state, phase: { kind: 'idle' }, cycles: 0 }, effects }
}

export function skipBreak(state: TimerState, at: Timestamp, c: PomodoroConfig): Transition {
  const { phase } = state
  if (phase.kind !== 'break' && phase.kind !== 'breakOver') return { state, effects: [] }
  return startFocus(state, at, phase.taskId, c)
}

export function setMode(state: TimerState, mode: TimerMode): TimerState {
  // Switching mode only while idle keeps the running entry and its phase consistent.
  if (state.phase.kind !== 'idle') return state
  return { ...state, mode, cycles: 0 }
}

/**
 * Advances time. Handles focus end and break end, including when the app was closed for
 * a while: a focus that ended in the past is closed at its exact end, not at "now".
 */
export function tick(state: TimerState, now: Timestamp, c: PomodoroConfig): Transition {
  const { phase } = state
  const effects: Effect[] = []

  if (phase.kind === 'running' && phase.durationMs !== undefined) {
    const focusEnd = phase.startedAt + phase.durationMs
    if (now < focusEnd) return { state, effects }

    effects.push({ type: 'stopEntry', at: focusEnd }, { type: 'notify', event: 'focusDone' })
    const cycles = state.cycles + 1
    const long = cycles % c.longEvery === 0
    const breakMs = (long ? c.longBreakMin : c.shortBreakMin) * MIN
    const breakState: TimerState = {
      ...state,
      cycles,
      phase: c.autoStartBreak
        ? { kind: 'break', long, endsAt: focusEnd + breakMs, taskId: phase.taskId }
        : { kind: 'breakOver', taskId: phase.taskId },
    }
    // The break may also have run out while the app was closed.
    const next = tick(breakState, now, c)
    return { state: next.state, effects: [...effects, ...next.effects] }
  }

  if (phase.kind === 'break' && now >= phase.endsAt) {
    effects.push({ type: 'notify', event: 'breakDone' })
    if (c.autoStartFocus) {
      const next = startFocus(state, phase.endsAt, phase.taskId, c)
      // A cycle finished while away is replayed until "now".
      const caught = tick(next.state, now, c)
      return { state: caught.state, effects: [...effects, ...next.effects, ...caught.effects] }
    }
    return { state: { ...state, phase: { kind: 'breakOver', taskId: phase.taskId } }, effects }
  }

  return { state, effects }
}

/** Milliseconds left in the current Pomodoro phase, or elapsed for a stopwatch. */
export function display(state: TimerState, now: Timestamp, c: PomodoroConfig) {
  const { phase } = state
  switch (phase.kind) {
    case 'running':
      return phase.durationMs !== undefined
        ? { ms: Math.max(0, phase.startedAt + phase.durationMs - now), total: phase.durationMs, countdown: true }
        : { ms: now - phase.startedAt, total: undefined, countdown: false }
    case 'paused':
      return phase.remainingMs !== undefined
        ? { ms: phase.remainingMs, total: focusMs(c), countdown: true }
        : { ms: 0, total: undefined, countdown: false }
    case 'break': {
      const total = (phase.long ? c.longBreakMin : c.shortBreakMin) * MIN
      return { ms: Math.max(0, phase.endsAt - now), total, countdown: true }
    }
    default:
      return {
        ms: state.mode === 'pomodoro' ? focusMs(c) : 0,
        total: state.mode === 'pomodoro' ? focusMs(c) : undefined,
        countdown: state.mode === 'pomodoro',
      }
  }
}

/** "1:05:09" / "25:00". */
export function formatClock(ms: number) {
  const total = Math.floor(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
