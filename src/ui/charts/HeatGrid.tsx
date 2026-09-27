import { useState, type CSSProperties, type ReactNode } from 'react'
import { intensity } from './scale'
import s from './charts.module.css'

interface HeatGridProps {
  /** values[row][col] */
  values: number[][]
  rowLabels: string[]
  /** Column captions; null leaves a column unlabelled. */
  colLabels: (string | null)[]
  tint?: string
  ariaLabel: string
  tip: (row: number, col: number, value: number) => ReactNode
}

/** A matrix of cells shaded by value — e.g. weekday × hour of day. */
export function HeatGrid({
  values,
  rowLabels,
  colLabels,
  tint = 'var(--accent)',
  ariaLabel,
  tip,
}: HeatGridProps) {
  const [hover, setHover] = useState<{ row: number; col: number; x: number; y: number } | null>(
    null,
  )
  const max = Math.max(0, ...values.flat())
  const cols = colLabels.length

  return (
    <div
      className={s.heatGrid}
      role="img"
      aria-label={ariaLabel}
      style={{ '--cols': cols, '--heat-tint': tint } as CSSProperties}
      // A finger leaves on lift: keep its tip until the next touch; a mouse clears on leave.
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
    >
      <span />
      {colLabels.map((label, i) => (
        <span key={i} className={s.heatColLabel}>
          {label}
        </span>
      ))}
      {values.map((row, r) => (
        <div key={r} className={s.heatRow}>
          <span className={s.heatRowLabel}>{rowLabels[r]}</span>
          {row.map((v, c) => (
            <span
              key={c}
              className={s.heatCell}
              data-active={hover?.row === r && hover.col === c}
              style={{ '--v': intensity(v, max) } as CSSProperties}
              onPointerEnter={(e) => {
                const el = e.currentTarget
                setHover({ row: r, col: c, x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop })
              }}
            />
          ))}
        </div>
      ))}
      {hover && (
        <div className={s.tip} style={{ left: hover.x, top: hover.y - 6 }}>
          {tip(hover.row, hover.col, values[hover.row]![hover.col]!)}
        </div>
      )}
    </div>
  )
}
