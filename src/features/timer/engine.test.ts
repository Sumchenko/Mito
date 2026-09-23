import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POMODORO as C,
  display,
  formatClock,
  INITIAL_TIMER,
  pause,
  resume,
  setMode,
  skipBreak,
  start,
  stop,
  tick,
  type TimerState,
} from './engine'

const MIN = 60_000
const t0 = 1_000_000_000_000
const pomodoro: TimerState = setMode(INITIAL_TIMER, 'pomodoro')

describe('stopwatch', () => {
  it('starts, pauses and resumes the same task as separate entries', () => {
    const a = start(INITIAL_TIMER, t0, 'task', C)
    expect(a.effects).toEqual([{ type: 'startEntry', taskId: 'task', at: t0, source: 'timer' }])
    const b = pause(a.state, t0 + 5 * MIN)
    expect(b.effects).toEqual([{ type: 'stopEntry', at: t0 + 5 * MIN }])
    expect(b.state.phase).toEqual({ kind: 'paused', taskId: 'task', remainingMs: undefined })
    const c = resume(b.state, t0 + 10 * MIN, C)
    expect(c.effects[0]).toMatchObject({ type: 'startEntry', taskId: 'task' })
  })

  it('never ends by itself', () => {
    const a = start(INITIAL_TIMER, t0, undefined, C)
    expect(tick(a.state, t0 + 10 * 60 * MIN, C).effects).toEqual([])
    expect(display(a.state, t0 + 90_000, C)).toMatchObject({ ms: 90_000, countdown: false })
  })

  it('switching task mid-run starts a new entry but keeps running', () => {
    const a = start(INITIAL_TIMER, t0, 'a', C)
    const b = start(a.state, t0 + MIN, 'b', C)
    expect(b.effects).toEqual([{ type: 'startEntry', taskId: 'b', at: t0 + MIN, source: 'timer' }])
    expect(b.state.phase).toMatchObject({ kind: 'running', taskId: 'b', startedAt: t0 })
  })
})

describe('pomodoro', () => {
  it('ends focus exactly on time and starts a short break', () => {
    const a = start(pomodoro, t0, 'task', C)
    expect(tick(a.state, t0 + 24 * MIN, C).effects).toEqual([])
    const b = tick(a.state, t0 + 25 * MIN + 3000, C)
    expect(b.effects).toEqual([
      { type: 'stopEntry', at: t0 + 25 * MIN },
      { type: 'notify', event: 'focusDone' },
    ])
    expect(b.state).toMatchObject({ cycles: 1, phase: { kind: 'break', long: false, endsAt: t0 + 30 * MIN } })
  })

  it('closes a focus that ended while the app was closed at its real end', () => {
    const a = start(pomodoro, t0, 'task', C)
    const b = tick(a.state, t0 + 3 * 60 * MIN, C)
    expect(b.effects[0]).toEqual({ type: 'stopEntry', at: t0 + 25 * MIN })
    // The break is also long over by then.
    expect(b.state.phase).toEqual({ kind: 'breakOver', taskId: 'task' })
    expect(b.effects.map((e) => e.type)).toEqual(['stopEntry', 'notify', 'notify'])
  })

  it('gives a long break after every fourth focus', () => {
    let s: TimerState = { ...pomodoro, cycles: 3 }
    s = start(s, t0, undefined, C).state
    const b = tick(s, t0 + 25 * MIN, C)
    expect(b.state.phase).toMatchObject({ kind: 'break', long: true, endsAt: t0 + 40 * MIN })
  })

  it('waits for the user after a break unless autoStartFocus is on', () => {
    const inBreak = tick(start(pomodoro, t0, 'x', C).state, t0 + 25 * MIN, C).state
    expect(tick(inBreak, t0 + 30 * MIN, C).state.phase.kind).toBe('breakOver')
    const auto = tick(inBreak, t0 + 30 * MIN, { ...C, autoStartFocus: true })
    expect(auto.effects).toContainEqual({ type: 'startEntry', taskId: 'x', at: t0 + 30 * MIN, source: 'pomodoro' })
  })

  it('pause keeps the remaining focus time for resume', () => {
    const a = start(pomodoro, t0, 'x', C)
    const p = pause(a.state, t0 + 10 * MIN)
    expect(p.state.phase).toEqual({ kind: 'paused', taskId: 'x', remainingMs: 15 * MIN })
    const r = resume(p.state, t0 + 60 * MIN, C)
    expect(r.state.phase).toMatchObject({ kind: 'running', startedAt: t0 + 60 * MIN, durationMs: 15 * MIN })
    expect(tick(r.state, t0 + 75 * MIN, C).effects[0]).toEqual({ type: 'stopEntry', at: t0 + 75 * MIN })
  })

  it('skip break starts the next focus; stop resets the set', () => {
    const inBreak = tick(start(pomodoro, t0, 'x', C).state, t0 + 25 * MIN, C).state
    const next = skipBreak(inBreak, t0 + 26 * MIN, C)
    expect(next.state.phase).toMatchObject({ kind: 'running', taskId: 'x', durationMs: 25 * MIN })
    const stopped = stop(next.state, t0 + 27 * MIN)
    expect(stopped.state).toMatchObject({ cycles: 0, phase: { kind: 'idle' } })
    expect(stopped.effects).toEqual([{ type: 'stopEntry', at: t0 + 27 * MIN }])
  })

  it('does not change mode while a session is active', () => {
    const running = start(pomodoro, t0, undefined, C).state
    expect(setMode(running, 'stopwatch').mode).toBe('pomodoro')
  })
})

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(3_909_000)).toBe('1:05:09')
    expect(formatClock(-5)).toBe('0:00')
  })
})
