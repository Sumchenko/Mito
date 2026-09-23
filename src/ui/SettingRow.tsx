import type { ReactNode } from 'react'
import s from './SettingRow.module.css'

interface SettingRowProps {
  icon: ReactNode
  title: string
  description?: string
  children: ReactNode
}

/** A Windows 11 Settings-style row: icon, text block and a trailing control. */
export function SettingRow({ icon, title, description, children }: SettingRowProps) {
  return (
    <div className={s.row}>
      <span className={s.icon}>{icon}</span>
      <div className={s.text}>
        <div>{title}</div>
        {description && <div className={s.description}>{description}</div>}
      </div>
      <div className={s.control}>{children}</div>
    </div>
  )
}
