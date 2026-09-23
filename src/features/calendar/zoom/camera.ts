import { addDays, type LocalDate } from '@/data'

/*
 * Semantic zoom camera.
 *
 * The world is an endless column of week rows (Monday → Sunday). A day lives at
 * (row, col); inside a row, the vertical fraction is the time of day. The camera looks at
 * (cx, cy) in world units — cx in day columns, cy in rows — at a zoom level z. Everything the
 * user sees (column width, row height, hour height) is derived continuously from z, so the
 * view never switches layouts: it only moves and scales.
 *
 * When fewer than 7 columns are visible, columns outside 0..6 continue into the neighbouring
 * week (column 7 of row r is Monday of row r + 1), so horizontal panning across weeks is
 * seamless.
 */

/** Monday used as row 0. Any Monday works; this one keeps row numbers small and positive. */
const EPOCH = Date.UTC(2000, 0, 3)
const DAY_MS = 86_400_000

export interface Viewport {
  width: number
  height: number
}

export interface Camera {
  /** 0 = one day … 6 = a year. */
  z: number
  /** Centre column (fractional); 3.5 is the middle of a week. */
  cx: number
  /** Centre row (fractional); the fraction is the time of day while rows are taller than the screen. */
  cy: number
}

export const Z_MIN = 0
export const Z_MAX = 6

/** Named stops for buttons and keyboard; the camera may rest anywhere in between. */
export const STOPS = { day: 0, '3days': 1, week: 2, month: 4, year: 6 } as const
export type Stop = keyof typeof STOPS

// ---------- Days ↔ world ----------

function utcDays(day: LocalDate) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY_MS)
}

export function dayToCell(day: LocalDate) {
  const n = utcDays(day)
  return { row: Math.floor(n / 7), col: ((n % 7) + 7) % 7 }
}

/** Day at a (possibly out-of-range) column of a row. */
export function cellToDay(row: number, col: number): LocalDate {
  return addDays('2000-01-03', row * 7 + col)
}

// ---------- Scale ----------

/**
 * Keyframes of the zoom. Rows are measured in pixels at close zoom (a full 24-hour timeline)
 * and relative to the screen height once several weeks are visible.
 */
function keyframes(vp: Viewport) {
  return [
    { cols: 1, rowH: 24 * 64 },
    { cols: 3, rowH: 24 * 56 },
    { cols: 7, rowH: 24 * 48 },
    { cols: 7, rowH: vp.height / 1.7 },
    { cols: 7, rowH: vp.height / 5.2 },
    { cols: 7, rowH: vp.height / 13 },
    { cols: 7, rowH: Math.max(12, vp.height / 44) },
  ]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Geometric interpolation — equal steps of z feel like equal steps of zoom. */
const loglerp = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t))

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export interface Scale {
  cols: number
  colW: number
  rowH: number
  /** Height of one hour inside a row. */
  hourPx: number
}

export function scaleAt(z: number, vp: Viewport): Scale {
  const kf = keyframes(vp)
  const zc = Math.min(Z_MAX, Math.max(Z_MIN, z))
  const i = Math.min(kf.length - 2, Math.floor(zc))
  const t = zc - i
  // Snap to an exact week: float noise (6.9999…) would otherwise leak neighbouring weeks in.
  const rawCols = loglerp(kf[i]!.cols, kf[i + 1]!.cols, t)
  const cols = rawCols > 6.995 ? 7 : rawCols
  // Never let rows shrink below the height the screen needs to stay meaningful.
  const rowH = loglerp(kf[i]!.rowH, kf[i + 1]!.rowH, t)
  return { cols, colW: vp.width / cols, rowH, hourPx: rowH / 24 }
}

// ---------- Camera constraints ----------

/**
 * Keeps the camera valid for its zoom:
 * - columns are normalised into 0..7 by moving whole weeks between rows;
 * - as the view widens toward a full week, cx eases to the middle so the week lines up;
 * - while a row is taller than the screen, cy stays inside that row (00:00 … 24:00).
 */
export function constrain(cam: Camera, vp: Viewport, row?: number): Camera {
  const s = scaleAt(cam.z, vp)
  let { cx, cy } = cam

  // Seamless week wrap: column 7 of a row is column 0 of the next row.
  while (cx >= 7) {
    cx -= 7
    cy += 1
  }
  while (cx < 0) {
    cx += 7
    cy -= 1
  }

  const half = s.cols / 2
  const toWeek = smoothstep(5, 7, s.cols)
  // Near a full week the window must cover exactly Monday..Sunday.
  if (s.cols >= 7) cx = 3.5
  else cx = lerp(cx, Math.min(7 - half, Math.max(half, cx)), toWeek)

  if (s.rowH > vp.height) {
    const base = row ?? Math.floor(cy)
    const margin = vp.height / 2 / s.rowH
    cy = Math.min(base + 1 - margin, Math.max(base + margin, cy))
  }
  return { z: Math.min(Z_MAX, Math.max(Z_MIN, cam.z)), cx, cy }
}

// ---------- Screen ↔ world ----------

export function worldAt(px: number, py: number, cam: Camera, vp: Viewport) {
  const s = scaleAt(cam.z, vp)
  return { col: cam.cx + (px - vp.width / 2) / s.colW, row: cam.cy + (py - vp.height / 2) / s.rowH }
}

export function screenOf(col: number, row: number, cam: Camera, vp: Viewport) {
  const s = scaleAt(cam.z, vp)
  return { x: vp.width / 2 + (col - cam.cx) * s.colW, y: vp.height / 2 + (row - cam.cy) * s.rowH }
}

/**
 * Zoom to `z` keeping the world point under the screen point (px, py) fixed — the essence of
 * "zoom where I look".
 */
export function zoomAround(cam: Camera, z: number, px: number, py: number, vp: Viewport): Camera {
  const anchor = worldAt(px, py, cam, vp)
  const s = scaleAt(z, vp)
  const next = {
    z,
    cx: anchor.col - (px - vp.width / 2) / s.colW,
    cy: anchor.row - (py - vp.height / 2) / s.rowH,
  }
  return constrain(next, vp, Math.floor(anchor.row))
}

/** Camera centred on a day, at the given zoom, looking at a time of day (minutes). */
export function cameraOn(day: LocalDate, z: number, vp: Viewport, minutes = 12 * 60): Camera {
  const { row, col } = dayToCell(day)
  return constrain({ z, cx: col + 0.5, cy: row + minutes / (24 * 60) }, vp, row)
}

/** Visible cells (with a margin) for rendering. Columns may exceed 0..6 when cols < 7. */
export function visibleCells(cam: Camera, vp: Viewport, margin = 1) {
  const s = scaleAt(cam.z, vp)
  const partial = s.cols < 7
  const c0 = partial ? Math.floor(cam.cx - vp.width / 2 / s.colW) - margin : 0
  const c1 = partial ? Math.ceil(cam.cx + vp.width / 2 / s.colW) + margin : 7
  const r0 = Math.floor(cam.cy - vp.height / 2 / s.rowH) - margin
  const r1 = Math.ceil(cam.cy + vp.height / 2 / s.rowH) + margin
  const cells: { row: number; col: number; day: LocalDate }[] = []
  // A day can be reachable from two cells (column 7 of one row = column 0 of the next);
  // render it once, or duplicate keys would scramble the DOM.
  const seen = new Set<LocalDate>()
  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const day = cellToDay(r, c)
      if (seen.has(day)) continue
      seen.add(day)
      cells.push({ row: r, col: c, day })
    }
  }
  return cells
}
