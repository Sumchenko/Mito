import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { duration, ease } from '@/design/motion'
import { cx } from '@/lib/cx'
import s from './Menu.module.css'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

interface MenuProps {
  /** Renders the trigger; call `toggle` from its onClick. */
  trigger: (props: { toggle: () => void; open: boolean }) => ReactNode
  items: MenuItem[]
  /** Optional custom content above the items (e.g. a color picker). */
  header?: ReactNode
  align?: 'start' | 'end'
}

/** Windows 11 MenuFlyout: drops down from its trigger, closes on Esc, outside click or pick. */
export function Menu({ trigger, items, header, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLElement)
    all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
  }

  return (
    <div ref={root} className={s.root}>
      {trigger({ toggle: () => setOpen((o) => !o), open })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            className={cx(s.menu, align === 'end' ? s.end : s.start)}
            onKeyDown={onKeyNav}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
          >
            {header}
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cx(s.item, item.danger && s.danger)}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon && <span className={s.icon}>{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
