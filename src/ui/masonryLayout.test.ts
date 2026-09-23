import { describe, expect, it } from 'vitest'
import { packColumns } from './masonryLayout'

describe('packColumns', () => {
  it('puts each item into the shortest column and levels the bottoms', () => {
    // Tall, short, short, short: the short ones fill in beside the tall one.
    const { columns, spans } = packColumns([400, 100, 150, 120], 2, 10)
    expect(columns).toEqual([0, 1, 1, 1])
    const bottom = (c: number) => spans.filter((_, i) => columns[i] === c).reduce((a, b) => a + b, 0)
    expect(bottom(0)).toBe(bottom(1))
    // Only the last item of the shorter column grows.
    expect(spans).toEqual([410, 110, 160, 140])
  })

  it('keeps reading order when heights are equal', () => {
    expect(packColumns([100, 100, 100, 100], 2, 0).columns).toEqual([0, 1, 0, 1])
  })

  it('handles fewer items than columns', () => {
    expect(packColumns([200], 2, 12)).toEqual({ columns: [0], spans: [212] })
  })
})
