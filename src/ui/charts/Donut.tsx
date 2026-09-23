import type { ReactNode } from 'react'
import s from './charts.module.css'

interface DonutProps {
  segments: { key: string; tint: string; value: number }[]
  size?: number
  thickness?: number
  /** Highlighted segment; the others fade. Controlled so a legend can drive it. */
  activeKey?: string | null
  onHover?: (key: string | null) => void
  onSelect?: (key: string) => void
  ariaLabel: string
  children?: ReactNode
}

/** Share of a whole. Segments are circle strokes, so there is no path maths to get wrong. */
export function Donut({ segments, size = 180, thickness = 18, activeKey, onHover, onSelect, ariaLabel, children }: DonutProps) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((sum, x) => sum + x.value, 0)
  const gap = segments.length > 1 ? Math.min(3, c / segments.length / 4) : 0
  let acc = 0

  return (
    <div className={s.donut} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={ariaLabel}>
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} />
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} className={s.donutSpin}>
          {total > 0 &&
            segments.map((seg) => {
              const len = (seg.value / total) * c
              const dash = Math.max(0.5, len - gap)
              const offset = -acc
              acc += len
              return (
                <circle
                  key={seg.key}
                  className={s.donutSeg}
                  data-dim={!!activeKey && activeKey !== seg.key}
                  data-clickable={!!onSelect}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={seg.tint}
                  strokeWidth={thickness}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={offset}
                  onPointerEnter={() => onHover?.(seg.key)}
                  onPointerLeave={() => onHover?.(null)}
                  onClick={() => onSelect?.(seg.key)}
                />
              )
            })}
        </g>
      </svg>
      {children && <div className={s.center}>{children}</div>}
    </div>
  )
}
