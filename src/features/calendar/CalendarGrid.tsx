import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { timeBlocksRepo, type LocalDate, type TimeBlock, type Timestamp } from '@/data'
import { formatClock } from '@/features/timer/engine'
import { BlockPopover, DraftPopover } from './BlockPopovers'
import { draggedTask } from './colors'
import {
  atMinutes,
  clampMinutes,
  DAY_MIN,
  dayAtX,
  dayPart,
  layoutLanes,
  minutesOfDay,
  minutesToPx,
  pxToMinutes,
  snap,
  SNAP_MIN,
} from './geometry'
import type { CalendarData } from './useCalendarData'
import s from './calendar.module.css'

type Drag =
  | { kind: 'create'; day: LocalDate; anchor: number; startMin: number; endMin: number; moved: boolean }
  | {
      kind: 'move' | 'resize-start' | 'resize-end'
      block: TimeBlock
      day: LocalDate
      startMin: number
      endMin: number
      grab: number
      x: number
      y: number
      moved: boolean
    }

interface Slot {
  day: LocalDate
  startMin: number
  endMin: number
}

interface GridProps {
  days: LocalDate[]
  hourPx: number
  data: CalendarData
  today: LocalDate
  now: Timestamp
  onDayClick: (day: LocalDate) => void
}

const DRAG_THRESHOLD = 4
const EDGE_SCROLL = 48

export function CalendarGrid({ days, hourPx, data, today, now, onDayClick }: GridProps) {
  const { t, i18n } = useTranslation()
  const scroller = useRef<HTMLDivElement>(null)
  const columns = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [draft, setDraft] = useState<{ slot: Slot; rect: DOMRect } | null>(null)
  const [opened, setOpened] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [dropSlot, setDropSlot] = useState<Slot | null>(null)

  // Fact track: wide with labels in the day view, a slim stripe when several days are shown.
  const factWidth = days.length === 1 ? '32%' : days.length <= 3 ? '14px' : '8px'

  // Open near the current time (or the start of a working day) when the visible range changes.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const focus = days.includes(today) ? minutesOfDay(now) - 90 : 8 * 60
    el.scrollTop = Math.max(0, minutesToPx(focus, hourPx))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on navigation, not every tick
  }, [days[0], days.length, hourPx])

  /** Pointer → (day, minutes) inside the columns area. */
  const pointAt = (clientX: number, clientY: number) => {
    const r = columns.current!.getBoundingClientRect()
    return {
      day: dayAtX(clientX - r.left, r.width, days),
      min: clampMinutes(pxToMinutes(clientY - r.top, hourPx)),
    }
  }

  /** Screen rectangle of a slot — anchors popovers without measuring DOM nodes. */
  const slotRect = (slot: Slot) => {
    const r = columns.current!.getBoundingClientRect()
    const width = r.width / days.length
    const i = days.indexOf(slot.day)
    return new DOMRect(
      r.left + i * width,
      r.top + minutesToPx(slot.startMin, hourPx),
      width,
      minutesToPx(slot.endMin - slot.startMin, hourPx),
    )
  }

  const autoScroll = (clientY: number) => {
    const el = scroller.current!
    const r = el.getBoundingClientRect()
    if (clientY < r.top + EDGE_SCROLL) el.scrollTop -= 12
    else if (clientY > r.bottom - EDGE_SCROLL) el.scrollTop += 12
  }

  // ---------- Pointer interactions ----------

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || draft || opened) return
    const p = pointAt(e.clientX, e.clientY)
    const anchor = Math.floor(p.min / SNAP_MIN) * SNAP_MIN
    columns.current!.setPointerCapture(e.pointerId)
    setDrag({ kind: 'create', day: p.day, anchor, startMin: anchor, endMin: anchor + SNAP_MIN, moved: false })
  }

  const onBlockDown = (e: ReactPointerEvent, block: TimeBlock, day: LocalDate, part: Slot, mode: Drag['kind']) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = pointAt(e.clientX, e.clientY)
    columns.current!.setPointerCapture(e.pointerId)
    setDrag({
      kind: mode as 'move',
      block,
      day,
      startMin: part.startMin,
      endMin: part.endMin,
      grab: p.min - part.startMin,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    })
  }

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return
    autoScroll(e.clientY)
    const p = pointAt(e.clientX, e.clientY)
    const cur = snap(p.min)
    if (drag.kind === 'create') {
      const startMin = Math.min(drag.anchor, cur)
      const endMin = Math.max(drag.anchor + SNAP_MIN, cur)
      setDrag({ ...drag, startMin, endMin, moved: drag.moved || cur !== drag.anchor })
      return
    }
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_THRESHOLD
    if (!moved) return
    if (drag.kind === 'move') {
      const length = drag.endMin - drag.startMin
      const startMin = Math.min(DAY_MIN - length, Math.max(0, snap(p.min - drag.grab)))
      setDrag({ ...drag, day: p.day, startMin, endMin: startMin + length, moved })
    } else if (drag.kind === 'resize-end') {
      setDrag({ ...drag, endMin: Math.max(drag.startMin + SNAP_MIN, cur), moved })
    } else {
      setDrag({ ...drag, startMin: Math.min(drag.endMin - SNAP_MIN, cur), moved })
    }
  }

  const onUp = () => {
    if (!drag) return
    setDrag(null)
    if (drag.kind === 'create') {
      // A plain click creates a one-hour block on the half hour under the pointer.
      const slot = drag.moved
        ? { day: drag.day, startMin: drag.startMin, endMin: drag.endMin }
        : { day: drag.day, startMin: Math.floor(drag.anchor / 30) * 30, endMin: Math.min(DAY_MIN, Math.floor(drag.anchor / 30) * 30 + 60) }
      setDraft({ slot, rect: slotRect(slot) })
      return
    }
    if (!drag.moved) {
      setOpened({ id: drag.block.id, rect: slotRect(drag) })
      return
    }
    void timeBlocksRepo.update(drag.block.id, {
      start: atMinutes(drag.day, drag.startMin),
      end: atMinutes(drag.day, drag.endMin),
    })
  }

  // ---------- Drop of tasks from the side panel ----------

  const dropLength = () => Math.min(240, Math.max(SNAP_MIN, draggedTask.current?.estimateMin ?? 60))

  const onDragOver = (e: DragEvent) => {
    if (!draggedTask.current) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const p = pointAt(e.clientX, e.clientY)
    const length = dropLength()
    const startMin = Math.min(DAY_MIN - length, Math.max(0, snap(p.min - SNAP_MIN)))
    const next = { day: p.day, startMin, endMin: startMin + length }
    if (!dropSlot || next.day !== dropSlot.day || next.startMin !== dropSlot.startMin) setDropSlot(next)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const task = draggedTask.current
    const slot = dropSlot
    setDropSlot(null)
    draggedTask.current = null
    if (task && slot) {
      void timeBlocksRepo.create({ taskId: task.id, start: atMinutes(slot.day, slot.startMin), end: atMinutes(slot.day, slot.endMin) })
    }
  }

  // ---------- Rendering ----------

  const time = (min: number) => {
    const h = Math.floor(min / 60) % 24
    return `${String(h).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, "0")}`
  }
  const openedBlock = opened ? data.blocks.find((b) => b.id === opened.id) : undefined
  const nowMin = minutesOfDay(now)

  return (
    <div className={s.grid} style={{ '--hour': `${hourPx}px`, '--days': days.length, '--fact': factWidth } as CSSProperties}>
      <div className={s.head}>
        <div className={s.gutterHead} />
        {days.map((day) => {
          const date = new Date(`${day}T12:00`)
          return (
            <button key={day} type="button" className={s.dayHead} data-today={day === today} onClick={() => onDayClick(day)}>
              <span className={s.weekday}>{date.toLocaleDateString(i18n.language, { weekday: 'short' })}</span>
              <span className={s.dayNum}>{date.getDate()}</span>
            </button>
          )
        })}
      </div>

      <div ref={scroller} className={s.scroller}>
        <div className={s.body}>
          <div className={s.gutter} aria-hidden>
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className={s.hourLabel} style={{ top: (i + 1) * hourPx }}>
                {time((i + 1) * 60)}
              </span>
            ))}
            {days.includes(today) && (
              <span className={s.nowLabel} style={{ top: minutesToPx(nowMin, hourPx) }}>
                {time(nowMin)}
              </span>
            )}
          </div>

          <div
            ref={columns}
            className={s.columns}
            onPointerDown={onBackgroundDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            onDragOver={onDragOver}
            onDragLeave={() => setDropSlot(null)}
            onDrop={onDrop}
          >
            {days.map((day) => (
              <DayColumn
                key={day}
                day={day}
                data={data}
                hourPx={hourPx}
                now={now}
                isToday={day === today}
                drag={drag}
                labels={days.length === 1}
                onBlockDown={onBlockDown}
                fallbackTitle={t('calendar.noTask')}
              />
            ))}

            {/* Ghosts: a block being created, a pending draft, a task being dropped. */}
            {[
              drag?.kind === 'create' ? drag : null,
              draft?.slot ?? null,
              dropSlot,
            ].map(
              (slot, i) =>
                slot && (
                  <div
                    key={i}
                    className={s.ghost}
                    style={{
                      left: `calc(${(days.indexOf(slot.day) / days.length) * 100}% + 2px)`,
                      width: `calc(${100 / days.length}% - var(--fact) - 8px)`,
                      top: minutesToPx(slot.startMin, hourPx),
                      height: minutesToPx(slot.endMin - slot.startMin, hourPx),
                    }}
                  >
                    {time(slot.startMin)}–{time(slot.endMin)}
                  </div>
                ),
            )}
          </div>
        </div>
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
      {opened && openedBlock && (
        <BlockPopover anchor={opened.rect} block={openedBlock} data={data} onClose={() => setOpened(null)} />
      )}
    </div>
  )
}

interface DayColumnProps {
  day: LocalDate
  data: CalendarData
  hourPx: number
  now: Timestamp
  isToday: boolean
  drag: Drag | null
  labels: boolean
  fallbackTitle: string
  onBlockDown: (e: ReactPointerEvent, block: TimeBlock, day: LocalDate, part: Slot, mode: Drag['kind']) => void
}

function DayColumn({ day, data, hourPx, now, isToday, drag, labels, fallbackTitle, onBlockDown }: DayColumnProps) {
  const dragged = drag && drag.kind !== 'create' && drag.moved ? drag : null

  // Plan: blocks on this day, with the dragged one shown at its live position.
  const parts = data.blocks
    .filter((b) => b.id !== dragged?.block.id)
    .flatMap((b) => {
      const part = dayPart(b.start, b.end, day)
      return part ? [{ block: b, start: part.startMin, end: part.endMin }] : []
    })
  if (dragged && dragged.day === day) {
    parts.push({ block: dragged.block, start: dragged.startMin, end: dragged.endMin })
  }
  const lanes = layoutLanes(parts)

  // Fact: tracked entries, the running one growing with the clock.
  const facts = data.entries.flatMap((e) => {
    const part = dayPart(e.start, e.end ?? now, day)
    return part ? [{ entry: e, ...part }] : []
  })

  const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={s.column} data-today={isToday}>
      <div className={s.plan}>
        {parts.map((part) => {
          const { block, start, end } = part
          const lane = lanes.get(part)!
          const height = minutesToPx(end - start, hourPx)
          const isDragged = dragged?.block.id === block.id
          return (
            <div
              key={block.id}
              className={s.block}
              data-kind={block.kind}
              data-dragging={isDragged}
              data-past={block.end < now}
              data-compact={height < 34}
              style={
                {
                  '--block': data.blockTint(block),
                  top: minutesToPx(start, hourPx),
                  height: Math.max(height, 14),
                  left: `calc(${(lane.lane / lane.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / lane.lanes}% - 2px)`,
                } as CSSProperties
              }
              onPointerDown={(e) => onBlockDown(e, block, day, { day, startMin: start, endMin: end }, 'move')}
            >
              <span
                className={s.resizeTop}
                onPointerDown={(e) => onBlockDown(e, block, day, { day, startMin: start, endMin: end }, 'resize-start')}
              />
              <span className={s.blockTitle}>{data.blockTitle(block, fallbackTitle)}</span>
              <span className={s.blockTime}>
                {isDragged
                  ? `${formatMinutesOfDay(start)}–${formatMinutesOfDay(end)}`
                  : `${time(block.start)}–${time(block.end)}`}
              </span>
              <span
                className={s.resizeBottom}
                onPointerDown={(e) => onBlockDown(e, block, day, { day, startMin: start, endMin: end }, 'resize-end')}
              />
            </div>
          )
        })}
      </div>

      <div className={s.fact} aria-hidden={!labels}>
        {facts.map(({ entry, startMin, endMin }) => {
          const height = minutesToPx(endMin - startMin, hourPx)
          const task = entry.taskId ? data.taskById.get(entry.taskId) : undefined
          const running = entry.end === null
          return (
            <div
              key={entry.id}
              className={s.factItem}
              data-running={running}
              style={{ '--block': data.entryTint(entry), top: minutesToPx(startMin, hourPx), height: Math.max(height, 3) } as CSSProperties}
              title={`${task?.title ?? fallbackTitle} · ${time(entry.start)}–${running ? '…' : time(entry.end!)}`}
            >
              {labels && height >= 30 && (
                <>
                  <span className={s.factTitle}>{task?.title ?? fallbackTitle}</span>
                  <span className={s.factTime}>
                    {running ? formatClock(now - entry.start) : `${time(entry.start)}–${time(entry.end!)}`}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {isToday && <div className={s.nowLine} style={{ top: minutesToPx(minutesOfDay(now), hourPx) }} />}
    </div>
  )
}

function formatMinutesOfDay(min: number) {
  const h = Math.floor(min / 60)
  return `${String(h).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
