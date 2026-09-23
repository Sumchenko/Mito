import type { CSSProperties, ReactNode } from 'react'
import s from './charts.module.css'

interface GaugeProps {
  /** 0..1; values above 1 draw a full ring. */
  value: number | null
  tint: string
  size?: number
  thickness?: number
  ariaLabel: string
  children?: ReactNode
}

/** A single ratio as a ring that fills clockwise from the top. */
export function Gauge({ value, tint, size = 120, thickness = 10, ariaLabel, children }: GaugeProps) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value)) * c

  return (
    <div className={s.donut} style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={ariaLabel}>
        <circle className={s.ringTrack} cx={size / 2} cy={size / 2} r={r} strokeWidth={thickness} />
        {filled > 0 && (
          <circle
            className={s.gaugeFill}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--c': c } as CSSProperties}
          />
        )}
      </svg>
      {children && <div className={s.center}>{children}</div>}
    </div>
  )
}
