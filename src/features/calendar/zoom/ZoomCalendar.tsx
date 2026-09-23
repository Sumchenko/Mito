import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toLocalDate, useNow, type LocalDate } from '@/data'
import { minutesOfDay } from '../geometry'
import {
  cameraOn,
  cellToDay,
  scaleAt,
  screenOf,
  smoothstep,
  STOPS,
  visibleCells,
  type Stop,
} from './camera'
import { DayTile } from './DayTile'
import { useZoomCamera } from './useZoomCamera'
import { useZoomData } from './useZoomData'
import s from './zoom.module.css'

const GUTTER = 56
const HEADER = 48

export interface ZoomApi {
  goToStop: (stop: Stop) => void
  today: () => void
}

interface ZoomCalendarProps {
  /** Receives the controls once. */
  onApi?: (api: ZoomApi) => void
  /** Called only when the nearest named zoom level changes — not on every frame. */
  onStop?: (stop: Stop) => void
}

const STOP_LIST = Object.keys(STOPS) as Stop[]
const nearestStop = (z: number) =>
  STOP_LIST.reduce((best, stop) =>
    Math.abs(STOPS[stop] - z) < Math.abs(STOPS[best] - z) ? stop : best,
  )

/**
 * The semantic zoom surface. It re-renders every animation frame, so it talks to the page
 * sparingly: a stable API object and a notification when the nearest stop changes.
 */
export function ZoomCalendar({ onApi, onStop }: ZoomCalendarProps) {
  const { t, i18n } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const vp = useMemo(
    () => ({ width: Math.max(1, size.width - GUTTER), height: Math.max(1, size.height - HEADER) }),
    [size],
  )
  const now = useNow(30_000)
  const today = toLocalDate(now)

  const { cam, zoomBy, zoomTo, panBy, goTo, camRef } = useZoomCamera(vp, () =>
    cameraOn(today, STOPS.week, { width: 1200, height: 700 }, minutesOfDay(now) + 60),
  )

  useLayoutEffect(() => {
    const el = root.current!
    const ro = new ResizeObserver(([e]) =>
      setSize({ width: e!.contentRect.width, height: e!.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Re-centre on today once the real viewport size is known.
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || size.width === 0) return
    placed.current = true
    goTo(today, STOPS.week, minutesOfDay(now) + 60)
  }, [size, goTo, today, now])

  const scale = scaleAt(cam.z, vp)
  const cells = visibleCells(cam, vp)
  const rows = cells.map((c) => c.row)
  const data = useZoomData(Math.min(...rows), Math.max(...rows), t('calendar.noTask'))

  // Level-of-detail blend. Each representation fades in as the previous one fades out.
  const timelineO = smoothstep(8, 14, scale.hourPx)
  const textO = smoothstep(24, 38, scale.hourPx) * smoothstep(56, 90, scale.colW)
  const summaryO = (1 - smoothstep(9, 15, scale.hourPx)) * smoothstep(30, 52, scale.rowH)
  const heatO = 1 - smoothstep(30, 52, scale.rowH)
  const detailedHeader = smoothstep(0.7, 1, scale.rowH / vp.height)
  // Stable object per combination so memoised tiles re-render only when a layer toggles.
  const showTimeline = timelineO > 0.001
  const showSummary = summaryO > 0.001
  const showHeat = heatO > 0.001
  const layers = useMemo(
    () => ({ timeline: showTimeline, summary: showSummary, heat: showHeat }),
    [showTimeline, showSummary, showHeat],
  )

  // ---------- Gestures ----------

  const pointer = useRef<{ x: number; y: number; id: number } | null>(null)
  const pinch = useRef<{
    pts: Map<number, { x: number; y: number }>
    d0: number
    z0: number
  } | null>(null)
  const local = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - GUTTER, y: e.clientY - r.top - HEADER }
  }

  // Wheel must be non-passive to stop the page from scrolling or browser-zooming.
  useEffect(() => {
    const el = root.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const p = local(e)
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels with ±100.
        zoomBy(-e.deltaY * unit * 0.0045, p.x, p.y)
      } else if (e.shiftKey) {
        panBy(e.deltaY * unit, 0)
      } else {
        panBy(e.deltaX * unit, e.deltaY * unit)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy, panBy])

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    root.current!.setPointerCapture(e.pointerId)
    if (e.pointerType === 'touch') {
      const pts = pinch.current?.pts ?? new Map()
      pts.set(e.pointerId, local(e))
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]
        pinch.current = { pts, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: camRef.current.z }
        pointer.current = null
        return
      }
      pinch.current = { pts, d0: 0, z0: camRef.current.z }
    }
    pointer.current = { ...local(e), id: e.pointerId }
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = local(e)
    const pc = pinch.current
    if (pc && pc.pts.has(e.pointerId) && pc.pts.size === 2 && pc.d0 > 0) {
      pc.pts.set(e.pointerId, p)
      const [a, b] = [...pc.pts.values()] as [{ x: number; y: number }, { x: number; y: number }]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      zoomTo(pc.z0 - Math.log2(d / pc.d0) * 0.9, (a.x + b.x) / 2, (a.y + b.y) / 2)
      return
    }
    const ptr = pointer.current
    if (!ptr || ptr.id !== e.pointerId) return
    panBy(ptr.x - p.x, ptr.y - p.y)
    pointer.current = { ...p, id: e.pointerId }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    pinch.current?.pts.delete(e.pointerId)
    if (pinch.current && pinch.current.pts.size < 2) pinch.current.d0 = 0
    if (pointer.current?.id === e.pointerId) pointer.current = null
  }

  const onDoubleClick = (e: ReactMouseEvent) => {
    const p = local(e)
    const s = scaleAt(camRef.current.z, vp)
    const col = Math.floor(camRef.current.cx + (p.x - vp.width / 2) / s.colW)
    const rowF = camRef.current.cy + (p.y - vp.height / 2) / s.rowH
    const day = cellToDay(Math.floor(rowF), col)
    const minutes = s.rowH > vp.height ? (rowF - Math.floor(rowF)) * 1440 : 9 * 60
    // One level deeper each time: year/month → week → day.
    goTo(day, camRef.current.z > STOPS.week + 0.5 ? STOPS.week : STOPS.day, minutes)
  }

  // ---------- Toolbar API & keyboard ----------

  const centerDay = () => {
    const c = camRef.current
    return cellToDay(Math.floor(c.cy), Math.floor(c.cx))
  }
  const centerMinutes = () => {
    const c = camRef.current
    return scaleAt(c.z, vp).rowH > vp.height ? (c.cy - Math.floor(c.cy)) * 1440 : 12 * 60
  }

  const stop = nearestStop(cam.z)
  useEffect(() => onStop?.(stop), [stop, onStop])

  // Latest handlers behind a stable facade; refreshed after each render, used from events only.
  const api = useRef<ZoomApi>(null)
  useEffect(() => {
    api.current = {
      goToStop: (stop) => {
        // Prefer today when it is on screen; otherwise zoom around the centre of the view.
        const onScreen = visibleCells(camRef.current, vp, 0).some((c) => c.day === today)
        const day = onScreen ? today : centerDay()
        goTo(day, STOPS[stop], day === today ? minutesOfDay(Date.now()) + 60 : centerMinutes())
      },
      today: () => goTo(today, Math.min(camRef.current.z, STOPS.week), minutesOfDay(Date.now()) + 60),
    }
  })
  useEffect(() => {
    onApi?.({ goToStop: (st) => api.current?.goToStop(st), today: () => api.current?.today() })
  }, [onApi])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const s = scaleAt(camRef.current.z, vp)
      const cx = vp.width / 2
      const cy = vp.height / 2
      if (e.key === '+' || e.key === '=') zoomBy(-0.5, cx, cy)
      else if (e.key === '-' || e.key === '_') zoomBy(0.5, cx, cy)
      else if (e.key === 'ArrowLeft') panBy(-(s.cols < 7 ? s.colW : 0), 0)
      else if (e.key === 'ArrowRight') panBy(s.cols < 7 ? s.colW : 0, 0)
      else if (e.key === 'ArrowUp') panBy(0, -Math.min(s.rowH, vp.height * 0.4))
      else if (e.key === 'ArrowDown') panBy(0, Math.min(s.rowH, vp.height * 0.4))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomBy, panBy, vp, camRef])

  // ---------- Render ----------

  const hUnit = t('common.h')
  const duration = useMemo(() => {
    const m = i18n.language === 'ru' ? 'м' : 'm'
    return (min: number) =>
      `${Math.floor(min / 60)}${hUnit} ${String(Math.round(min % 60)).padStart(2, '0')}${m}`
  }, [hUnit, i18n.language])

  // Formatting dates is surprisingly costly per frame; reuse formatters.
  const fmt = useMemo(() => {
    const make = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(i18n.language, o)
    return {
      long: make({ month: 'long' }),
      short: make({ month: 'short' }),
      wdShort: make({ weekday: 'short' }),
      wdNarrow: make({ weekday: 'narrow' }),
    }
  }, [i18n.language])
  const monthName = (day: LocalDate, style: 'long' | 'short') =>
    fmt[style].format(new Date(`${day}T12:00`))

  const centerRow = Math.floor(cam.cy)
  const seenCols = new Set<number>()
  const headerCols = cells.filter((c) =>
    seenCols.has(c.col) ? false : (seenCols.add(c.col), true),
  )

  const hourStep = scale.hourPx >= 40 ? 1 : scale.hourPx >= 20 ? 3 : 6
  const nowMin = minutesOfDay(now)

  return (
    <div
      ref={root}
      className={s.root}
      style={
        {
          '--timeline-o': timelineO,
          '--text-o': textO,
          '--summary-o': summaryO,
          '--heat-o': heatO,
          '--heat-num-o': smoothstep(19, 28, scale.rowH) * smoothstep(40, 70, scale.colW),
          '--fact-w': `${Math.max(3, Math.min(10, scale.colW * 0.05))}px`,
          '--gutter': `${GUTTER}px`,
          '--header': `${HEADER}px`,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div className={s.world}>
        {cells.map(({ row, col, day }) => {
          const p = screenOf(col, row, cam, vp)
          const dayNum = Number(day.slice(8))
          return (
            <div
              key={day}
              className={s.tile}
              data-today={day === today}
              data-odd-month={Number(day.slice(5, 7)) % 2 === 1}
              data-month-start={dayNum <= 7}
              data-first={dayNum === 1}
              data-weekend={((col % 7) + 7) % 7 >= 5}
              style={{
                transform: `translate3d(${p.x}px, ${p.y}px, 0)`,
                width: scale.colW,
                height: scale.rowH,
              }}
            >
              <DayTile
                day={day}
                items={data.items.get(day)}
                stats={data.stats.get(day)}
                monthLabel={dayNum === 1 ? monthName(day, 'short') : undefined}
                duration={duration}
                layers={layers}
              />
              {day === today && (
                <div className={s.nowLine} style={{ top: `${(nowMin / 1440) * 100}%` }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Hour labels for each visible row while the timeline is shown. */}
      <div className={s.gutter} style={{ opacity: timelineO }} aria-hidden>
        {timelineO > 0 &&
          [...new Set(rows)].flatMap((row) => {
            const top = screenOf(0, row, cam, vp).y
            return Array.from({ length: Math.floor(23 / hourStep) }, (_, i) => {
              const h = (i + 1) * hourStep
              const y = top + h * scale.hourPx
              return y > -20 && y < vp.height + 20 ? (
                <span
                  key={`${row}-${h}`}
                  className={s.hour}
                  style={{ transform: `translateY(${y}px)` }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ) : null
            })
          })}
      </div>

      {/* Month names beside the first week of each month when zoomed out. */}
      <div className={s.gutter} style={{ opacity: 1 - timelineO }} aria-hidden>
        {timelineO < 1 &&
          [...new Set(rows)].flatMap((row) => {
            const first = Array.from({ length: 7 }, (_, c) => cellToDay(row, c)).find((d) =>
              d.endsWith('-01'),
            )
            if (!first) return []
            const y = screenOf(0, row, cam, vp).y
            return [
              <span key={row} className={s.month} style={{ transform: `translateY(${y}px)` }}>
                {monthName(first, scale.rowH > 60 ? 'long' : 'short')}
                {first.slice(5, 7) === '01' && <b>{first.slice(0, 4)}</b>}
              </span>,
            ]
          })}
      </div>

      <div className={s.header}>
        {headerCols.map(({ col }) => {
          const x = screenOf(col, 0, cam, vp).x
          const day = cellToDay(centerRow, col)
          const date = new Date(`${day}T12:00`)
          return (
            <div
              key={col}
              className={s.headCell}
              data-today={day === today && detailedHeader > 0.5}
              style={{ transform: `translateX(${x}px)`, width: scale.colW }}
            >
              <span className={s.headWeekday}>
                {(scale.colW > 90 ? fmt.wdShort : fmt.wdNarrow).format(date)}
              </span>
              <span className={s.headDate} style={{ opacity: detailedHeader }}>
                {date.getDate()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
