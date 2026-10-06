import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { intensity } from './scale'
import s from './charts.module.css'

export interface YearMapCell {
  key: string
  value: number
  today?: boolean
  /** Not yet happened: drawn empty and not interactive. */
  future?: boolean
}

export interface YearMapColumn {
  /** Month caption above the column where a month starts. */
  label?: string
  /** Seven cells, Monday first; null outside the range. */
  cells: (YearMapCell | null)[]
}

interface YearMapProps {
  columns: YearMapColumn[]
  rowLabels: (string | null)[]
  tint?: string
  ariaLabel: string
  tip: (cell: YearMapCell) => ReactNode
  onSelect?: (cell: YearMapCell) => void
}

/** Days as small squares, one column per week — a year at a glance. */
export function YearMap({
  columns,
  rowLabels,
  tint = 'var(--accent)',
  ariaLabel,
  tip,
  onSelect,
}: YearMapProps) {
  /** Where the hovered day is on screen; the tip floats above the page, outside the scroller. */
  const [hover, setHover] = useState<{ cell: YearMapCell; box: DOMRect } | null>(null)
  /** A finger inspects days (details under the map); only a mouse click opens one. */
  const [touch, setTouch] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const max = Math.max(0, ...columns.flatMap((c) => c.cells.map((x) => x?.value ?? 0)))

  // A tip pinned to screen coordinates would drift once anything scrolls: drop it instead.
  const hovering = hover !== null
  useEffect(() => {
    if (!hovering) return
    const hide = () => setHover(null)
    const el = scroller.current
    window.addEventListener('scroll', hide, true)
    el?.addEventListener('scroll', hide)
    return () => {
      window.removeEventListener('scroll', hide, true)
      el?.removeEventListener('scroll', hide)
    }
  }, [hovering])

  // Too narrow for the whole year (phones), the map scrolls sideways: start at the latest weeks.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [columns.length])

  return (
    <>
      <div
        ref={scroller}
        className={s.yearScroll}
        onPointerDown={(e) => setTouch(e.pointerType === 'touch')}
      >
        <div
          className={s.yearMap}
          role="img"
          aria-label={ariaLabel}
          style={{ '--weeks': columns.length, '--heat-tint': tint } as CSSProperties}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        >
          <span />
          {columns.map((col, i) => (
            <span key={i} className={s.yearMonth}>
              {col.label}
            </span>
          ))}
          <div className={s.yearDays}>
            {rowLabels.map((label, i) => (
              <span key={i}>{label}</span>
            ))}
          </div>
          {columns.map((col, i) => (
            <div key={i} className={s.yearWeek}>
              {col.cells.map((cell, j) =>
                cell ? (
                  <span
                    key={j}
                    className={s.yearCell}
                    data-today={cell.today}
                    data-future={cell.future}
                    data-clickable={!!onSelect && !cell.future}
                    style={{ '--v': cell.future ? 0 : intensity(cell.value, max) } as CSSProperties}
                    onPointerEnter={(e) => {
                      if (cell.future) return
                      setHover({ cell, box: e.currentTarget.getBoundingClientRect() })
                    }}
                    onClick={() => !cell.future && !touch && onSelect?.(cell)}
                  />
                ) : (
                  <span key={j} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      {hover && !touch && createPortal(<FloatingTip box={hover.box}>{tip(hover.cell)}</FloatingTip>, document.body)}
      {touch && hover && <div className={s.yearCaption}>{tip(hover.cell)}</div>}
    </>
  )
}

/** Room the tip needs above a cell, and how close to a screen edge it may centre itself. */
const ROOM_ABOVE = 110
const EDGE = 140

/**
 * The day's tip, fixed to the screen: never clipped by the card or the sideways scroller, and
 * never widening it. It opens below the top rows and leans inwards at the screen's edges.
 */
function FloatingTip({ box, children }: { box: DOMRect; children: ReactNode }) {
  const below = box.top < ROOM_ABOVE
  const align = box.left < EDGE ? 'start' : box.right > window.innerWidth - EDGE ? 'end' : 'center'
  const left = align === 'start' ? box.left : align === 'end' ? box.right : box.left + box.width / 2
  return (
    <div
      className={`${s.tip} ${s.tipFixed}`}
      data-below={below}
      data-align={align}
      style={{ left, top: below ? box.bottom + 6 : box.top - 6 }}
    >
      {children}
    </div>
  )
}
