import { describe, expect, it } from 'vitest'
import { labelEvery, timeTicks } from './scale'

const H = 3_600_000

describe('timeTicks', () => {
  it('picks round hour steps with a few gridlines', () => {
    expect(timeTicks(5.2 * H)).toEqual({ top: 6 * H, ticks: [2 * H, 4 * H, 6 * H] })
    expect(timeTicks(40 * 60_000).ticks).toEqual([15 * 60_000, 30 * 60_000, 45 * 60_000])
    expect(timeTicks(0).top).toBe(H)
  })

  it('handles large totals', () => {
    const { top, ticks } = timeTicks(1500 * H)
    expect(top).toBeGreaterThanOrEqual(1500 * H)
    expect(ticks.length).toBeLessThanOrEqual(4)
  })

  it('spaces labels', () => {
    expect(labelEvery(40, 28)).toBe(1)
    expect(labelEvery(10, 28)).toBe(3)
  })
})
