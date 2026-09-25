import { AnimatePresence } from 'motion/react'
import { cloneElement, isValidElement } from 'react'
import { useLocation, useOutlet } from 'react-router'
import { useSettings } from '@/app/settings'
import { useApplySettings } from '@/app/useApplySettings'
import { AuthDialog } from '@/features/account/AuthDialog'
import { TimerController } from '@/features/timer/TimerController'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { NavPane } from './NavPane'
import { TitleBar } from './TitleBar'
import s from './AppShell.module.css'

/**
 * Windows 11 NavigationView layout: title bar and navigation sit on the base (Mica) backdrop,
 * the page lives on a raised content layer with a rounded top-left corner.
 */
export function AppShell() {
  useApplySettings()
  const location = useLocation()
  const outlet = useOutlet()
  const navCollapsed = useSettings((st) => st.navCollapsed)
  const mobile = useMediaQuery('(max-width: 640px)')
  const narrow = useMediaQuery('(max-width: 1000px)')

  return (
    <div className={s.shell} data-mobile={mobile}>
      <TimerController />
      <AuthDialog />
      <TitleBar mobile={mobile} />
      {!mobile && <NavPane compact={navCollapsed || narrow} />}
      <main className={s.content}>
        <AnimatePresence mode="wait" initial={false}>
          {/* Keyed by section so in-section navigation (e.g. between task lists) keeps state. */}
          {isValidElement(outlet) && cloneElement(outlet, { key: location.pathname.split('/')[1] })}
        </AnimatePresence>
      </main>
      {mobile && <NavPane compact bottom />}
    </div>
  )
}
