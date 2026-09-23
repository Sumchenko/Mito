const MIN = 60_000
const HOUR = 60 * MIN

/** Tick steps for a time axis, from a quarter hour up. */
const STEPS = [15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 5 * HOUR, 10 * HOUR, 20 * HOUR, 25 * HOUR, 50 * HOUR, 100 * HOUR, 200 * HOUR, 500 * HOUR]

/**
 * A readable time axis for values up to `max` ms: at most `maxTicks` gridlines on round
 * durations. Returns the axis top and the tick values (0 excluded).
 */
export function timeTicks(max: number, maxTicks = 4) {
  if (max <= 0) return { top: HOUR, ticks: [HOUR] }
  const step = STEPS.find((s) => max / s <= maxTicks) ?? Math.ceil(max / maxTicks / (100 * HOUR)) * 100 * HOUR
  const count = Math.max(1, Math.ceil(max / step))
  return { top: step * count, ticks: Array.from({ length: count }, (_, i) => step * (i + 1)) }
}

/** Every n-th label so labels are at least `minGap` px apart. */
export const labelEvery = (slot: number, minGap: number) => Math.max(1, Math.ceil(minGap / Math.max(1, slot)))

/** Intensity of `value` against the grid maximum; a gentle curve keeps small values visible. */
export const intensity = (value: number, max: number) => (value > 0 && max > 0 ? 0.12 + 0.88 * (value / max) ** 0.75 : 0)
