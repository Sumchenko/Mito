import type { CSSProperties, ReactNode } from 'react'
import s from './StatTile.module.css'

interface StatTileProps {
  icon: ReactNode
  /** One of the --tint-* tokens, e.g. 'var(--tint-blue)'. */
  tint: string
  label: string
  value: ReactNode
  hint?: string
  /** 0..1 — renders a thin progress bar when provided. */
  progress?: number
}

export function StatTile({ icon, tint, label, value, hint, progress }: StatTileProps) {
  return (
    <div className={s.tile} style={{ '--tile-tint': tint } as CSSProperties}>
      <span className={s.icon}>{icon}</span>
      <div className={s.body}>
        <div className={s.label}>{label}</div>
        <div className={s.value}>{value}</div>
        {hint && <div className={s.hint}>{hint}</div>}
        {progress !== undefined && (
          <div className={s.track}>
            <div className={s.fill} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
