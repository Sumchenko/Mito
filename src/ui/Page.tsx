import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { pageTransition } from '@/design/motion'
import s from './Page.module.css'

interface PageProps {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}

export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <motion.section className={s.page} {...pageTransition}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>{title}</h1>
          {subtitle && <p className={s.subtitle}>{subtitle}</p>}
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </header>
      {children}
    </motion.section>
  )
}

/** Honest placeholder for sections scheduled for a later roadmap stage. */
export function Upcoming({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className={s.upcoming}>
      <span className={s.upcomingIcon}>{icon}</span>
      <p>{text}</p>
    </div>
  )
}
