import { describe, expect, it } from 'vitest'
import {
  cameraOn,
  cellToDay,
  constrain,
  dayToCell,
  scaleAt,
  screenOf,
  visibleCells,
  worldAt,
  zoomAround,
} from './camera'

const vp = { width: 1400, height: 800 }

describe('days ↔ cells', () => {
  it('maps days to Monday-based week rows and back', () => {
    const wed = dayToCell('2026-09-23')
    expect(wed.col).toBe(2)
    expect(cellToDay(wed.row, wed.col)).toBe('2026-09-23')
    expect(dayToCell('2026-09-21')).toEqual({ row: wed.row, col: 0 })
    expect(dayToCell('2026-09-28')).toEqual({ row: wed.row + 1, col: 0 })
  })

  it('continues out-of-range columns into neighbouring weeks', () => {
    const { row } = dayToCell('2026-09-21')
    expect(cellToDay(row, 7)).toBe('2026-09-28')
    expect(cellToDay(row, -1)).toBe('2026-09-20')
  })
})

describe('scale', () => {
  it('goes from one day to a full week, then shrinks rows toward a year', () => {
    expect(scaleAt(0, vp).cols).toBeCloseTo(1)
    expect(scaleAt(2, vp).cols).toBeCloseTo(7)
    expect(scaleAt(0, vp).hourPx).toBeCloseTo(64)
    const heights = [2, 3, 4, 5, 6].map((z) => scaleAt(z, vp).rowH)
    for (let i = 1; i < heights.length; i++) expect(heights[i]).toBeLessThan(heights[i - 1]!)
    expect(scaleAt(6, vp).rowH).toBeGreaterThanOrEqual(12)
  })

  it('changes continuously between keyframes', () => {
    const a = scaleAt(3.999, vp).rowH
    const b = scaleAt(4, vp).rowH
    expect(Math.abs(a - b) / b).toBeLessThan(0.01)
  })
})

describe('camera', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const cam = cameraOn('2026-09-23', 3, vp)
    const before = worldAt(300, 500, cam, vp)
    const zoomed = zoomAround(cam, 3.6, 300, 500, vp)
    const after = worldAt(300, 500, zoomed, vp)
    expect(after.col).toBeCloseTo(before.col, 5)
    expect(after.row).toBeCloseTo(before.row, 5)
  })

  it('wraps columns across weeks without moving anything on screen', () => {
    const cam = { z: 0, cx: 7.3, cy: 100.5 }
    const wrapped = constrain(cam, vp)
    expect(wrapped.cx).toBeCloseTo(0.3)
    expect(wrapped.cy).toBeCloseTo(101.5)
    // Monday of the next week sits exactly where "column 7" was.
    const a = screenOf(7, 100, cam, vp)
    const b = screenOf(0, 101, wrapped, vp)
    expect(b.x).toBeCloseTo(a.x)
    expect(b.y).toBeCloseTo(a.y)
  })

  it('aligns to the whole week once a week is visible', () => {
    expect(constrain({ z: 2, cx: 1.2, cy: 10.5 }, vp).cx).toBe(3.5)
    expect(constrain({ z: 5, cx: 6, cy: 10.5 }, vp).cx).toBe(3.5)
  })

  it('keeps the view inside the day while a row is taller than the screen', () => {
    const top = constrain({ z: 2, cx: 3.5, cy: 50.01 }, vp)
    const s = scaleAt(2, vp)
    expect(top.cy).toBeCloseTo(50 + vp.height / 2 / s.rowH)
    const bottom = constrain({ z: 2, cx: 3.5, cy: 50.999 }, vp)
    expect(bottom.cy).toBeCloseTo(51 - vp.height / 2 / s.rowH)
  })

  it('never lists a day twice, even when neighbouring weeks are in view', () => {
    for (const z of [0, 0.5, 1, 1.5, 2, 3, 4, 5, 6]) {
      const days = visibleCells(cameraOn('2026-09-23', z, vp), vp).map((c) => c.day)
      expect(new Set(days).size).toBe(days.length)
    }
  })

  it('renders only what is visible: 7 columns at month zoom, neighbours at day zoom', () => {
    const month = visibleCells(cameraOn('2026-09-23', 4, vp), vp)
    expect(new Set(month.map((c) => c.col))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]))
    const day = visibleCells(cameraOn('2026-09-23', 0, vp), vp)
    expect(day.map((c) => c.day)).toContain('2026-09-23')
    expect(day.length).toBeLessThanOrEqual(12)
  })
})
