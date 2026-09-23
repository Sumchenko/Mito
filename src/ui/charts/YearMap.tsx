import { useState, type CSSProperties, type ReactNode } from 'react'
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
export function YearMap({ columns, rowLabels, tint = 'var(--accent)', ariaLabel, tip, onSelect }: YearMapProps) {
  const [hover, setHover] = useState<{ cell: YearMapCell; x: number; y: number } | null>(null)
  const max = Math.max(0, ...columns.flatMap((c) => c.cells.map((x) => x?.value ?? 0)))

  return (
    <div
      className={s.yearMap}
      role="img"
      aria-label={ariaLabel}
      style={{ '--weeks': columns.length, '--heat-tint': tint } as CSSProperties}
      onPointerLeave={() => setHover(null)}
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
                  const el = e.currentTarget
                  const parent = el.offsetParent as HTMLElement | null
                  const box = el.getBoundingClientRect()
                  const origin = parent?.getBoundingClientRect()
                  setHover({
                    cell,
                    x: box.left - (origin?.left ?? 0) + box.width / 2,
                    y: box.top - (origin?.top ?? 0),
                  })
                }}
                onClick={() => !cell.future && onSelect?.(cell)}
              />
            ) : (
              <span key={j} />
            ),
          )}
        </div>
      ))}
      {hover && (
        <div className={s.tip} style={{ left: hover.x, top: hover.y - 6 }}>
          {tip(hover.cell)}
        </div>
      )}
    </div>
  )
}
