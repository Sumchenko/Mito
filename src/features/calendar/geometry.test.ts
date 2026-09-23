import { describe, expect, it } from 'vitest'
import {
  atMinutes,
  dayAtX,
  dayPart,
  daysFrom,
  layoutLanes,
  snap,
  startOfWeek,
  viewStart,
} from './geometry'

describe('weeks and views', () => {
  it('starts weeks on Monday', () => {
    expect(startOfWeek('2026-09-23')).toBe('2026-09-21') // Wednesday → Monday
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21') // Sunday → previous Monday
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21')
  })

  it('anchors week views to Monday and others to the focus day', () => {
    expect(viewStart('week', '2026-09-23')).toBe('2026-09-21')
    expect(viewStart('3days', '2026-09-23')).toBe('2026-09-23')
    expect(daysFrom('2026-09-30', 3)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
  })
})

describe('time ↔ position', () => {
  it('snaps to 15 minutes', () => {
    expect(snap(7)).toBe(0)
    expect(snap(8)).toBe(15)
    expect(snap(52)).toBe(45)
  })

  it('splits intervals across midnight', () => {
    const start = atMinutes('2026-09-23', 23 * 60)
    const end = atMinutes('2026-09-24', 60)
    expect(dayPart(start, end, '2026-09-23')).toEqual({ startMin: 1380, endMin: 1440 })
    expect(dayPart(start, end, '2026-09-24')).toEqual({ startMin: 0, endMin: 60 })
    expect(dayPart(start, end, '2026-09-25')).toBeNull()
  })

  it('maps x to the day column', () => {
    const days = daysFrom('2026-09-21', 7)
    expect(dayAtX(0, 700, days)).toBe('2026-09-21')
    expect(dayAtX(699, 700, days)).toBe('2026-09-27')
    expect(dayAtX(9999, 700, days)).toBe('2026-09-27')
  })
})

describe('layoutLanes', () => {
  const item = (start: number, end: number) => ({ start, end })

  it('keeps non-overlapping items full width', () => {
    const a = item(0, 60)
    const b = item(60, 120)
    const lanes = layoutLanes([a, b])
    expect(lanes.get(a)).toEqual({ lane: 0, lanes: 1 })
    expect(lanes.get(b)).toEqual({ lane: 0, lanes: 1 })
  })

  it('puts overlapping items side by side and reuses freed lanes', () => {
    const a = item(0, 120)
    const b = item(30, 60)
    const c = item(60, 90) // b is done by then: reuses lane 1
    const lanes = layoutLanes([c, b, a])
    expect(lanes.get(a)).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get(b)).toEqual({ lane: 1, lanes: 2 })
    expect(lanes.get(c)).toEqual({ lane: 1, lanes: 2 })
  })

  it('treats separate clusters independently', () => {
    const a = item(0, 60)
    const b = item(30, 90)
    const c = item(200, 260)
    const lanes = layoutLanes([a, b, c])
    expect(lanes.get(c)).toEqual({ lane: 0, lanes: 1 })
    expect(lanes.get(b)?.lanes).toBe(2)
  })
})
