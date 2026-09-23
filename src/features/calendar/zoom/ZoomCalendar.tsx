import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  tasksRepo,
  timeBlocksRepo,
  toLocalDate,
  useNow,
  type LocalDate,
  type TimeBlock,
} from '@/data'
import { BlockPopover, DraftPopover, EntryPopover } from '../BlockPopovers'
import { draggedTask, setDraggedTask } from '../colors'
import { atMinutes, clampMinutes, minutesOfDay, snap, SNAP_MIN } from '../geometry'
import {
  cameraOn,
  cellToDay,
  dayToCell,
  worldAt,
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
  /** Previous/next period at the current level: days, a week, a month or a year. */
  step: (dir: 1 | -1) => void
}

export interface ZoomView {
  stop: Stop
  /** Day at the centre of the screen. */
  center: LocalDate
  /** Days currently on screen, in order. */
  days: LocalDate[]
}

interface ZoomCalendarProps {
  initial: { day: LocalDate; stop: Stop }
  /** Fact shown as a full column beside the plan instead of a thin strip. */
  factOpen?: boolean
  /** Receives the controls once. */
  onApi?: (api: ZoomApi) => void
  /** Called when the visible range or level changes — not on every animation frame. */
  onView?: (view: ZoomView) => void
}

type Slot = { day: LocalDate; startMin: number; endMin: number }
type Drag =
  | {
      kind: 'pan'
      x: number
      y: number
      x0: number
      y0: number
      moved: boolean
      /** Pressed on a fact entry: a click opens it, a drag still pans. */
      entry?: { id: string; rect: DOMRect }
    }
  | { kind: 'create'; anchor: number; slot: Slot; moved: boolean }
  | {
      kind: 'move' | 'resize-start' | 'resize-end'
      block: TimeBlock
      slot: Slot
      grab: number
      x0: number
      y0: number
      moved: boolean
    }

const DRAG_THRESHOLD = 4
/** Timeline opacity above which the surface edits instead of panning. */
const EDIT_THRESHOLD = 0.85
/** Holding a dragged task over a day this long zooms in so it can get a time. */
const SPRING_MS = 700

function shiftMonths(day: LocalDate, months: number) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const target = new Date(y, m - 1 + months, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return toLocalDate(new Date(target.getFullYear(), target.getMonth(), Math.min(d, last)))
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
export function ZoomCalendar({ initial, factOpen = false, onApi, onView }: ZoomCalendarProps) {
  const { t, i18n } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const vp = useMemo(
    () => ({ width: Math.max(1, size.width - GUTTER), height: Math.max(1, size.height - HEADER) }),
    [size],
  )
  const now = useNow(30_000)
  const today = toLocalDate(now)

  const startMinutes = initial.day === today ? minutesOfDay(now) + 60 : 13 * 60
  const { cam, zoomBy, zoomTo, panBy, goTo, camRef } = useZoomCamera(vp, () =>
    cameraOn(initial.day, STOPS[initial.stop], { width: 1200, height: 700 }, startMinutes),
  )

  useLayoutEffect(() => {
    const el = root.current!
    const ro = new ResizeObserver(([e]) =>
      setSize({ width: e!.contentRect.width, height: e!.contentRect.height }),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Settle on the initial day once the real viewport size is known.
  const placed = useRef(false)
  useEffect(() => {
    if (placed.current || size.width === 0) return
    placed.current = true
    goTo(initial.day, STOPS[initial.stop], startMinutes)
  }, [size, goTo, initial, startMinutes])

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

  const pinch = useRef<{
    pts: Map<number, { x: number; y: number }>
    d0: number
    z0: number
  } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<{ slot: Slot; rect: DOMRect } | null>(null)
  const [opened, setOpened] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [openedEntry, setOpenedEntry] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [hoverEntry, setHoverEntry] = useState<{ id: string; right: number; top: number } | null>(null)
  /** Where a dragged task would land: a slot at timeline zoom, a whole day when zoomed out. */
  const [drop, setDrop] = useState<{ day: LocalDate; slot?: Slot; x: number; y: number } | null>(null)
  const spring = useRef<{ day: LocalDate; timer: number } | null>(null)

  const local = (e: { clientX: number; clientY: number }) => {
    const r = root.current!.getBoundingClientRect()
    return { x: e.clientX - r.left - GUTTER, y: e.clientY - r.top - HEADER }
  }
  const editing = () => smoothstep(8, 14, scaleAt(camRef.current.z, vp).hourPx) > EDIT_THRESHOLD

  /** Screen point → day and minutes within it. */
  const pointAt = (x: number, y: number) => {
    const w = worldAt(x, y, camRef.current, vp)
    const row = Math.floor(w.row)
    return { day: cellToDay(row, Math.floor(w.col)), min: clampMinutes((w.row - row) * 1440) }
  }

  /** Client rectangle of a slot, for anchoring popovers. */
  const slotRect = (slot: Slot) => {
    const r = root.current!.getBoundingClientRect()
    const cell = cells.find((c) => c.day === slot.day) ?? dayToCell(slot.day)
    const sc = scaleAt(camRef.current.z, vp)
    const p = screenOf(cell.col, cell.row, camRef.current, vp)
    return new DOMRect(
      r.left + GUTTER + p.x,
      r.top + HEADER + p.y + (slot.startMin / 1440) * sc.rowH,
      sc.colW,
      ((slot.endMin - slot.startMin) / 1440) * sc.rowH,
    )
  }

  // Wheel must be non-passive to stop the page from scrolling or browser-zooming.
  useEffect(() => {
    const el = root.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setHoverEntry(null)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const p = local(e)
      if (e.ctrlKey || e.metaKey) {
        // Trackpad pinches arrive as ctrl+wheel with small deltas; mouse wheels with ±100.
        // Spreading the fingers (or wheel up) gives deltaY < 0 and must zoom in, i.e. lower z.
        zoomBy(e.deltaY * unit * 0.0045, p.x, p.y)
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
    const target = e.target as Element
    if (target.closest('[data-chrome]') || draft || opened || openedEntry) return
    setHoverEntry(null)
    if (e.pointerType === 'mouse' && e.button !== 0) return
    root.current!.setPointerCapture(e.pointerId)
    const p = local(e)

    if (e.pointerType === 'touch') {
      const pts = pinch.current?.pts ?? new Map()
      pts.set(e.pointerId, p)
      if (pts.size === 2) {
        const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]
        pinch.current = { pts, d0: Math.hypot(a.x - b.x, a.y - b.y), z0: camRef.current.z }
        setDrag(null)
        return
      }
      pinch.current = { pts, d0: 0, z0: camRef.current.z }
      // One finger always pans; a tap (no movement) acts like a click.
      setDrag({ kind: 'pan', x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false })
      return
    }

    if (!editing()) {
      setDrag({ kind: 'pan', x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false })
      return
    }
    const factEl = target.closest<HTMLElement>('[data-entry-id]')
    if (factEl) {
      const entry = { id: factEl.dataset.entryId!, rect: factEl.getBoundingClientRect() }
      setDrag({ kind: 'pan', x: p.x, y: p.y, x0: p.x, y0: p.y, moved: false, entry })
      return
    }
    const el = target.closest<HTMLElement>('[data-block-id]')
    const block = el ? data.blocks.find((b) => b.id === el.dataset.blockId) : undefined
    const at = pointAt(p.x, p.y)
    if (el && block) {
      const slot = {
        day: el.dataset.day as LocalDate,
        startMin: Number(el.dataset.start),
        endMin: Number(el.dataset.end),
      }
      const edge = target.closest<HTMLElement>('[data-edge]')?.dataset.edge
      setDrag({
        kind: edge === 'start' ? 'resize-start' : edge === 'end' ? 'resize-end' : 'move',
        block,
        slot,
        grab: at.min - slot.startMin,
        x0: p.x,
        y0: p.y,
        moved: false,
      })
    } else {
      const anchor = Math.floor(at.min / SNAP_MIN) * SNAP_MIN
      setDrag({
        kind: 'create',
        anchor,
        slot: { day: at.day, startMin: anchor, endMin: anchor + SNAP_MIN },
        moved: false,
      })
    }
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
    if (!drag) {
      // Hovering the fact track names what was worked on.
      const factEl = (e.target as Element).closest<HTMLElement>('[data-entry-id]')
      const id = factEl?.dataset.entryId
      if (id === hoverEntry?.id) return
      const r = root.current!.getBoundingClientRect()
      const rect = factEl?.getBoundingClientRect()
      setHoverEntry(id && rect ? { id, right: r.right - rect.left + 6, top: Math.max(4, rect.top - r.top) } : null)
      return
    }
    if (drag.kind === 'pan') {
      panBy(drag.x - p.x, drag.y - p.y)
      const moved = drag.moved || Math.hypot(p.x - drag.x0, p.y - drag.y0) > DRAG_THRESHOLD
      setDrag({ ...drag, x: p.x, y: p.y, moved })
      return
    }
    // Near the top/bottom edge, scroll the day along with the drag.
    if (p.y < 36) panBy(0, -10)
    else if (p.y > vp.height - 36) panBy(0, 10)
    const at = pointAt(p.x, p.y)
    const cur = snap(at.min)
    if (drag.kind === 'create') {
      const startMin = Math.min(drag.anchor, cur)
      const endMin = Math.max(drag.anchor + SNAP_MIN, cur)
      setDrag({
        ...drag,
        slot: { ...drag.slot, startMin, endMin },
        moved: drag.moved || cur !== drag.anchor,
      })
      return
    }
    const moved = drag.moved || Math.hypot(p.x - drag.x0, p.y - drag.y0) > DRAG_THRESHOLD
    if (!moved) return
    const { slot } = drag
    if (drag.kind === 'move') {
      const length = slot.endMin - slot.startMin
      const startMin = Math.min(1440 - length, Math.max(0, snap(at.min - drag.grab)))
      setDrag({ ...drag, slot: { day: at.day, startMin, endMin: startMin + length }, moved })
    } else if (drag.kind === 'resize-end') {
      setDrag({ ...drag, slot: { ...slot, endMin: Math.max(slot.startMin + SNAP_MIN, cur) }, moved })
    } else {
      setDrag({ ...drag, slot: { ...slot, startMin: Math.min(slot.endMin - SNAP_MIN, cur) }, moved })
    }
  }

  const onPointerUp = (e: ReactPointerEvent) => {
    pinch.current?.pts.delete(e.pointerId)
    if (pinch.current && pinch.current.pts.size < 2) pinch.current.d0 = 0
    const d = drag
    setDrag(null)
    if (!d) return
    const p = local(e)

    if (d.kind === 'pan') {
      if (d.moved) return
      if (d.entry) {
        setOpenedEntry(d.entry)
        return
      }
      const at = pointAt(p.x, p.y)
      if (editing()) {
        // A tap on the timeline proposes a one-hour block there.
        const start = Math.floor(at.min / 30) * 30
        const slot = { day: at.day, startMin: start, endMin: Math.min(1440, start + 60) }
        setDraft({ slot, rect: slotRect(slot) })
      } else {
        // Zoomed out, a click dives one level deeper into that day.
        goTo(at.day, camRef.current.z > STOPS.week + 0.5 ? STOPS.week : STOPS.day, 13 * 60)
      }
      return
    }
    if (d.kind === 'create') {
      const start = Math.floor(d.anchor / 30) * 30
      const slot = d.moved
        ? d.slot
        : { day: d.slot.day, startMin: start, endMin: Math.min(1440, start + 60) }
      setDraft({ slot, rect: slotRect(slot) })
      return
    }
    if (!d.moved) {
      setOpened({ id: d.block.id, rect: slotRect(d.slot) })
      return
    }
    void timeBlocksRepo.update(d.block.id, {
      start: atMinutes(d.slot.day, d.slot.startMin),
      end: atMinutes(d.slot.day, d.slot.endMin),
    })
  }

  // ---------- Dropping tasks from the side panel ----------

  const cancelSpring = () => {
    if (spring.current) window.clearTimeout(spring.current.timer)
    spring.current = null
  }

  /** Where the dragged task would land under this point; null over the header. */
  const dropAt = (e: { clientX: number; clientY: number }) => {
    const task = draggedTask.current
    const p = local(e)
    if (!task || p.y < 0 || p.x < 0) return null
    const at = pointAt(p.x, p.y)
    if (!editing()) return { day: at.day, x: p.x, y: p.y }
    const length = Math.min(240, Math.max(SNAP_MIN, task.estimateMin ?? 60))
    const startMin = Math.min(1440 - length, Math.max(0, snap(at.min - SNAP_MIN)))
    return { day: at.day, slot: { day: at.day, startMin, endMin: startMin + length }, x: p.x, y: p.y }
  }

  const onDragOver = (e: ReactDragEvent) => {
    if (!draggedTask.current) return
    e.preventDefault()
    const next = dropAt(e)
    e.dataTransfer.dropEffect = next ? 'copy' : 'none'
    if (!next) {
      cancelSpring()
      if (drop) setDrop(null)
      return
    }
    const changed = next.slot
      ? next.day !== drop?.day || next.slot.startMin !== drop.slot?.startMin
      : !drop || drop.slot || next.day !== drop.day || next.x !== drop.x || next.y !== drop.y
    if (changed) setDrop(next)
    // Zoomed out, lingering over a day dives into its week, where the task can get a time.
    if (next.slot) cancelSpring()
    else if (spring.current?.day !== next.day) {
      cancelSpring()
      const day = next.day
      spring.current = {
        day,
        timer: window.setTimeout(() => {
          spring.current = null
          goTo(day, STOPS.week, 13 * 60)
        }, SPRING_MS),
      }
    }
  }

  const onDragLeave = (e: ReactDragEvent) => {
    // Moving between tiles fires dragleave too; only leaving the calendar counts.
    if (root.current?.contains(e.relatedTarget as Node | null)) return
    cancelSpring()
    setDrop(null)
  }

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault()
    const task = draggedTask.current
    // Recompute from the pointer: state may lag a frame behind, or be cleared by a dragleave.
    const target = dropAt(e)
    setDraggedTask(null)
    cancelSpring()
    setDrop(null)
    if (!task || !target) return
    if (target.slot) {
      const { day, startMin, endMin } = target.slot
      void timeBlocksRepo.create({
        taskId: task.id,
        start: atMinutes(day, startMin),
        end: atMinutes(day, endMin),
      })
    } else {
      // Zoomed out there is no time axis: dropping plans the task for that day.
      void tasksRepo.update(task.id, { plannedDate: target.day })
    }
  }

  // A drag cancelled with Escape or dropped elsewhere ends here: clear the preview.
  useEffect(() => {
    const onEnd = () => {
      if (spring.current) window.clearTimeout(spring.current.timer)
      spring.current = null
      setDrop(null)
    }
    window.addEventListener('dragend', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd)
      onEnd()
    }
  }, [])

  // ---------- Toolbar API & keyboard ----------

  const centerDay = () => {
    const c = camRef.current
    return cellToDay(Math.floor(c.cy), Math.floor(c.cx))
  }
  const centerMinutes = () => {
    const c = camRef.current
    return scaleAt(c.z, vp).rowH > vp.height ? (c.cy - Math.floor(c.cy)) * 1440 : 12 * 60
  }

  // Report the visible range only when it changes (a string key keeps this off the hot path).
  const stop = nearestStop(cam.z)
  const onScreen = visibleCells(cam, vp, 0)
    .map((c) => c.day)
    .sort()
  const center = cellToDay(Math.floor(cam.cy), Math.floor(cam.cx))
  const viewKey = [stop, center, onScreen[0], onScreen[onScreen.length - 1]].join('|')
  const onViewRef = useRef(onView)
  useEffect(() => {
    onViewRef.current = onView
  })
  useEffect(() => {
    const [st, c, first, last] = viewKey.split('|') as [Stop, LocalDate, LocalDate, LocalDate]
    const days: LocalDate[] = []
    for (let d = first; d <= last; d = cellToDay(dayToCell(d).row, dayToCell(d).col + 1)) days.push(d)
    onViewRef.current?.({ stop: st, center: c, days })
  }, [viewKey])

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
      step: (dir) => {
        const z = camRef.current.z
        const current = nearestStop(z)
        const from = centerDay()
        const days = Math.max(1, Math.round(scaleAt(z, vp).cols))
        const cell = dayToCell(from)
        const target =
          current === 'year'
            ? shiftMonths(from, 12 * dir)
            : current === 'month'
              ? shiftMonths(from, dir)
              : cellToDay(cell.row, cell.col + dir * days)
        goTo(target, z, centerMinutes())
      },
    }
  })
  useEffect(() => {
    onApi?.({
      goToStop: (st) => api.current?.goToStop(st),
      today: () => api.current?.today(),
      step: (dir) => api.current?.step(dir),
    })
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
      dayMonth: make({ weekday: 'short', day: 'numeric', month: 'long' }),
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

  // Previews: a block being created, moved or resized, a pending draft, a dropped task.
  const moving = drag && drag.kind !== 'pan' && drag.kind !== 'create' && drag.moved ? drag : null
  const movingId = moving?.block.id
  const ghosts: { slot: Slot; tint?: string; title?: string }[] = []
  if (drag?.kind === 'create') ghosts.push({ slot: drag.slot })
  if (moving) {
    ghosts.push({
      slot: moving.slot,
      tint: data.blockTint(moving.block),
      title: data.blockTitle(moving.block, t('calendar.noTask')),
    })
  }
  if (draft) ghosts.push({ slot: draft.slot })
  if (drop?.slot) ghosts.push({ slot: drop.slot, title: draggedTask.current?.title })
  const openedBlock = opened ? data.blocks.find((b) => b.id === opened.id) : undefined
  const entryById = (id?: string) => (id ? data.entries.find((x) => x.id === id) : undefined)
  const openedEntryData = entryById(openedEntry?.id)
  const hovered = hoverEntry && !openedEntry && !drag ? entryById(hoverEntry.id) : undefined
  const nowMin = minutesOfDay(now)

  return (
    <div
      ref={root}
      className={s.root}
      data-interactive={timelineO > EDIT_THRESHOLD}
      data-fact={factOpen ? 'open' : 'strip'}
      style={
        {
          '--timeline-o': timelineO,
          '--text-o': textO,
          '--summary-o': summaryO,
          '--heat-o': heatO,
          '--heat-num-o': smoothstep(19, 28, scale.rowH) * smoothstep(40, 70, scale.colW),
          '--fact-w': `${Math.max(3, Math.min(14, scale.colW * 0.05))}px`,
          '--gutter': `${GUTTER}px`,
          '--header': `${HEADER}px`,
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onPointerLeave={() => setHoverEntry(null)}
      onDrop={onDrop}
    >
      <div className={s.world}>
        {cells.map(({ row, col, day }) => {
          const p = screenOf(col, row, cam, vp)
          const dayNum = Number(day.slice(8))
          return (
            <div
              key={day}
              className={s.tile}
              data-day={day}
              data-today={day === today}
              data-odd-month={Number(day.slice(5, 7)) % 2 === 1}
              data-month-start={dayNum <= 7}
              data-first={dayNum === 1}
              data-weekend={((col % 7) + 7) % 7 >= 5}
              data-drop={drop?.day === day && !drop.slot}
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
                hiddenBlockId={movingId}
              />
              {day === today && (
                <div className={s.nowLine} style={{ top: `${(nowMin / 1440) * 100}%` }} />
              )}
              {ghosts
                .filter((g) => g.slot.day === day)
                .map((g, i) => (
                  <div
                    key={i}
                    className={s.ghost}
                    data-solid={!!g.tint}
                    style={
                      {
                        '--block': g.tint,
                        top: `${(g.slot.startMin / 1440) * 100}%`,
                        height: `${((g.slot.endMin - g.slot.startMin) / 1440) * 100}%`,
                      } as CSSProperties
                    }
                  >
                    {g.title && <div>{g.title}</div>}
                    {clock(g.slot.startMin)}–{clock(g.slot.endMin)}
                  </div>
                ))}
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

      <div className={s.header} data-chrome>
        {headerCols.map(({ col }) => {
          const x = screenOf(col, 0, cam, vp).x
          const day = cellToDay(centerRow, col)
          const date = new Date(`${day}T12:00`)
          return (
            <button
              type="button"
              key={col}
              className={s.headCell}
              onClick={() => goTo(day, STOPS.day, centerMinutes())}
              data-today={day === today && detailedHeader > 0.5}
              style={{ transform: `translateX(${x}px)`, width: scale.colW }}
            >
              <span className={s.headWeekday}>
                {(scale.colW > 90 ? fmt.wdShort : fmt.wdNarrow).format(date)}
              </span>
              <span className={s.headDate} style={{ opacity: detailedHeader }}>
                {date.getDate()}
              </span>
              {factOpen && scale.colW >= 240 && (
                <span className={s.headColumns} style={{ opacity: timelineO }}>
                  <span>{t('calendar.plan')}</span>
                  <span>{t('calendar.fact')}</span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {draft && (
        <DraftPopover
          anchor={draft.rect}
          start={atMinutes(draft.slot.day, draft.slot.startMin)}
          end={atMinutes(draft.slot.day, draft.slot.endMin)}
          data={data}
          onClose={() => setDraft(null)}
        />
      )}
      {hovered && hoverEntry && (
        <FactTip
          right={hoverEntry.right}
          top={hoverEntry.top}
          title={(hovered.taskId && data.taskById.get(hovered.taskId)?.title) || t('calendar.noTask')}
          time={`${clock(minutesOfDay(hovered.start))}–${
            hovered.end === null ? t('calendar.running') : clock(minutesOfDay(hovered.end))
          } · ${duration(((hovered.end ?? now) - hovered.start) / 60_000)}`}
        />
      )}
      {drop && !drop.slot && (
        <div
          className={s.dropHint}
          style={{
            left: drop.x + GUTTER,
            top: drop.y + HEADER,
            // Keep the hint inside the card: flip it to the other side of the cursor near edges.
            transform: `translate(${drop.x > vp.width - 280 ? 'calc(-100% - 16px)' : '16px'}, ${
              drop.y > vp.height - 110 ? 'calc(-100% - 16px)' : '16px'
            })`,
          }}
        >
          <b>{fmt.dayMonth.format(new Date(`${drop.day}T12:00`))}</b>
          <span>{t('calendar.drop.toDay')}</span>
          <span className={s.dropHold}>
            {t('calendar.drop.hold')}
            <i key={drop.day} />
          </span>
        </div>
      )}
      {openedEntry && openedEntryData && (
        <EntryPopover
          anchor={openedEntry.rect}
          entry={openedEntryData}
          data={data}
          now={now}
          onClose={() => setOpenedEntry(null)}
        />
      )}
      {opened && openedBlock && (
        <BlockPopover anchor={opened.rect} block={openedBlock} data={data} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}

/** Hover label left of a fact entry, positioned inside the zoom root. */
function FactTip({ right, top, title, time }: { right: number; top: number; title: string; time: string }) {
  return (
    <div className={s.factTip} style={{ right, top }}>
      <span className={s.factTipTitle}>{title}</span>
      <span className={s.factTipTime}>{time}</span>
    </div>
  )
}

function clock(minutes: number) {
  const m = Math.round(minutes)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
