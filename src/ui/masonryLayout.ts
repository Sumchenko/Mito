export interface MasonryLayout {
  /** Column index of each item. */
  columns: number[]
  /** Height each item occupies, gap included; the last item of a shorter column is stretched. */
  spans: number[]
}

/**
 * Packs items of the given heights into columns: each goes to the currently shortest column
 * (ties to the left), so reading order is kept as far as possible. The last item of every
 * column then grows to the tallest column, so the columns end on one line with no holes.
 */
export function packColumns(heights: readonly number[], count: number, gap: number): MasonryLayout {
  const totals = new Array<number>(count).fill(0)
  const last = new Array<number>(count).fill(-1)
  const columns: number[] = []
  const spans: number[] = []
  heights.forEach((h, i) => {
    let col = 0
    for (let c = 1; c < count; c++) if (totals[c]! < totals[col]!) col = c
    columns.push(col)
    spans.push(Math.ceil(h) + gap)
    totals[col]! += Math.ceil(h) + gap
    last[col] = i
  })
  const max = Math.max(0, ...totals)
  last.forEach((i, c) => {
    if (i >= 0) spans[i]! += max - totals[c]!
  })
  return { columns, spans }
}
