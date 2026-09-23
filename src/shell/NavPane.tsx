import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { springFirm } from '@/design/motion'
import { footerNav, mainNav, type NavItem } from './navItems'
import s from './NavPane.module.css'

interface NavPaneProps {
  compact: boolean
  /** Horizontal bottom bar for phone-sized screens. */
  bottom?: boolean
}

export function NavPane({ compact, bottom }: NavPaneProps) {
  if (bottom) {
    return (
      <nav className={s.bottom} aria-label="Mito">
        {mainNav.map((item) => (
          <NavEntry key={item.to} item={item} compact bottom />
        ))}
      </nav>
    )
  }
  return (
    <nav className={s.pane} data-compact={compact} aria-label="Mito">
      <div className={s.group}>
        {mainNav.map((item) => (
          <NavEntry key={item.to} item={item} compact={compact} />
        ))}
      </div>
      <div className={s.group}>
        {footerNav.map((item) => (
          <NavEntry key={item.to} item={item} compact={compact} />
        ))}
      </div>
    </nav>
  )
}

function NavEntry({ item, compact, bottom }: { item: NavItem; compact: boolean; bottom?: boolean }) {
  const { t } = useTranslation()
  const label = t(`nav.${item.labelKey}`)
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={s.item}
      title={compact && !bottom ? label : undefined}
      aria-label={compact && !bottom ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={bottom ? 'nav-indicator-bottom' : 'nav-indicator'}
              className={s.indicator}
              transition={springFirm}
            />
          )}
          <item.Icon className={s.icon} filled={isActive} />
          {(!compact || bottom) && <span className={s.label}>{label}</span>}
        </>
      )}
    </NavLink>
  )
}
