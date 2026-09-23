import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalDate } from '@/data'
import {
  cameraOn,
  constrain,
  dayToCell,
  scaleAt,
  screenOf,
  worldAt,
  Z_MAX,
  Z_MIN,
  type Camera,
  type Viewport,
} from './camera'

/** Time constant of the camera smoothing: ~95% of a move completes in 3τ. */
const TAU = 90

interface Flight {
  zTarget: number
  /** World point that stays pinned to a screen point while zooming. */
  world: { col: number; row: number }
  screen: { x: number; y: number }
  screenTarget: { x: number; y: number }
}

/**
 * Animated camera. Every motion is "keep this world point at this screen point while z moves",
 * smoothed exponentially — frame-rate independent and without overshoot, so zooming feels
 * calm and precise rather than bouncy.
 */
export function useZoomCamera(vp: Viewport, initial: () => Camera) {
  const [cam, setCam] = useState(initial)
  const camRef = useRef(cam)
  const flight = useRef<Flight | null>(null)
  const raf = useRef(0)
  const last = useRef(0)

  const commit = useCallback((next: Camera) => {
    camRef.current = next
    setCam(next)
  }, [])

  // The animation step lives in a ref so the rAF loop can schedule itself.
  const step = useRef<(time: number) => void>(() => {})
  useEffect(() => {
    step.current = (time: number) => {
      const f = flight.current
      if (!f) return
      const dt = Math.min(64, time - (last.current || time))
      last.current = time
      const k = 1 - Math.exp(-dt / TAU)
      const cur = camRef.current
      const z = cur.z + (f.zTarget - cur.z) * k
      f.screen = {
        x: f.screen.x + (f.screenTarget.x - f.screen.x) * k,
        y: f.screen.y + (f.screenTarget.y - f.screen.y) * k,
      }
      const done =
        Math.abs(f.zTarget - z) < 0.0015 &&
        Math.hypot(f.screenTarget.x - f.screen.x, f.screenTarget.y - f.screen.y) < 0.5
      const zz = done ? f.zTarget : z
      const sx = done ? f.screenTarget.x : f.screen.x
      const sy = done ? f.screenTarget.y : f.screen.y
      const s = scaleAt(zz, vp)
      commit(
        constrain(
          { z: zz, cx: f.world.col - (sx - vp.width / 2) / s.colW, cy: f.world.row - (sy - vp.height / 2) / s.rowH },
          vp,
          Math.floor(f.world.row),
        ),
      )
      if (done) {
        flight.current = null
        last.current = 0
      } else {
        raf.current = requestAnimationFrame((t) => step.current(t))
      }
    }
  }, [vp, commit])

  const fly = useCallback(
    (f: Flight) => {
      const wasIdle = !flight.current
      flight.current = f
      if (wasIdle) {
        last.current = 0
        raf.current = requestAnimationFrame((t) => step.current(t))
      }
    },
    [],
  )

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // Keep the camera valid when the viewport is resized.
  useEffect(() => {
    if (vp.width > 0) commit(constrain(camRef.current, vp))
  }, [vp, commit])

  /** Zoom by `delta` levels around a screen point (cursor, pinch centre). */
  const zoomBy = useCallback(
    (delta: number, x: number, y: number) => {
      const base = flight.current?.zTarget ?? camRef.current.z
      const zTarget = Math.min(Z_MAX, Math.max(Z_MIN, base + delta))
      fly({ zTarget, world: worldAt(x, y, camRef.current, vp), screen: { x, y }, screenTarget: { x, y } })
    },
    [fly, vp],
  )

  /** Immediate zoom around a point — for pinch gestures that must track the fingers exactly. */
  const zoomTo = useCallback(
    (z: number, x: number, y: number) => {
      flight.current = null
      const cur = camRef.current
      const world = worldAt(x, y, cur, vp)
      const s = scaleAt(z, vp)
      commit(constrain({ z, cx: world.col - (x - vp.width / 2) / s.colW, cy: world.row - (y - vp.height / 2) / s.rowH }, vp, Math.floor(world.row)))
    },
    [commit, vp],
  )

  const panBy = useCallback(
    (dx: number, dy: number) => {
      flight.current = null
      const cur = camRef.current
      const s = scaleAt(cur.z, vp)
      commit(constrain({ ...cur, cx: cur.cx + dx / s.colW, cy: cur.cy + dy / s.rowH }, vp))
    },
    [commit, vp],
  )

  /** Fly to a day (and time of day) at a zoom level, bringing it to the screen centre. */
  const goTo = useCallback(
    (day: LocalDate, z: number, minutes = 12 * 60) => {
      const { row, col } = dayToCell(day)
      const target = cameraOn(day, z, vp, minutes)
      const world = { col: col + 0.5, row: row + minutes / 1440 }
      const screenTarget = screenOf(world.col, world.row, target, vp)
      fly({ zTarget: z, world, screen: screenOf(world.col, world.row, camRef.current, vp), screenTarget })
    },
    [fly, vp],
  )

  return { cam, zoomBy, zoomTo, panBy, goTo, camRef }
}
