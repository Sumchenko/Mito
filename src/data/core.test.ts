import { describe, expect, it } from 'vitest'
import { addDays, dayRange, isLocalDate, toLocalDate } from './dates'
import { newId } from './ids'

describe('newId (UUIDv7)', () => {
  it('has the UUIDv7 shape', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('sorts by creation order, even within one millisecond', () => {
    const ids = Array.from({ length: 500 }, () => newId(1_700_000_000_000))
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sorts by time across milliseconds', () => {
    expect(newId(1_900_000_000_000) > newId(1_800_000_000_000)).toBe(false) // clock went back: stays monotonic
    const a = newId(2_000_000_000_000)
    const b = newId(2_000_000_000_001)
    expect(b > a).toBe(true)
  })
})

describe('local dates', () => {
  it('formats a local calendar day', () => {
    expect(toLocalDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('validates real calendar days only', () => {
    expect(isLocalDate('2026-02-28')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('26-2-3')).toBe(false)
  })

  it('shifts days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('gives a [start, end) range covering the whole day', () => {
    const [from, to] = dayRange('2026-09-23')
    expect(toLocalDate(from)).toBe('2026-09-23')
    expect(toLocalDate(to)).toBe('2026-09-24')
    expect(toLocalDate(to - 1)).toBe('2026-09-23')
  })
})
