import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { duration, ease } from '@/design/motion'
import { useMediaQuery } from '@/lib/useMediaQuery'
import s from './Popover.module.css'

interface PopoverProps {
  /** Screen rectangle to attach to (e.g. a calendar block). */
  anchor: DOMRect
  onClose: () => void
  children: ReactNode
  width?: number
  label: string
}

const GAP = 8
const MARGIN = 12
/** Below this width there is no room beside anything: flyouts become bottom sheets. */
export const SHEET_QUERY = '(max-width: 640px)'

/**
 * Flyout attached beside a rectangle: right of it when there is room, otherwise left, and
 * clamped into the viewport. On phones it is a bottom sheet over a dimmed page instead — the
 * thumb reaches it, and the on-screen keyboard pushes it up rather than covering it.
 * Closes on Esc and outside press.
 */
export function Popover({ anchor, onClose, children, width = 320, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const sheet = useMediaQuery(SHEET_QUERY)
  const [pos, setPos] = useState<{ left: number; top: number; side: 'left' | 'right' }>()

  useLayoutEffect(() => {
    if (sheet) return
    const height = ref.current?.offsetHeight ?? 0
    const fitsRight = anchor.right + GAP + width + MARGIN <= window.innerWidth
    const left = fitsRight
      ? anchor.right + GAP
      : Math.max(MARGIN, anchor.left - GAP - width)
    const top = Math.min(Math.max(MARGIN, anchor.top), window.innerHeight - height - MARGIN)
    setPos({ left, top, side: fitsRight ? 'right' : 'left' })
  }, [anchor, width, sheet])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // Deferred so the press that opened the popover does not immediately close it.
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown), 0)
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (sheet) {
    return createPortal(
      <>
        <motion.div
          className={s.backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.normal } }}
        />
        <motion.div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={s.sheet}
          initial={{ y: '100%' }}
          animate={{ y: 0, transition: { duration: duration.slow, ease: ease.out } }}
        >
          {children}
        </motion.div>
      </>,
      document.body,
    )
  }

  return createPortal(
    <motion.div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={s.popover}
      style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      initial={{ opacity: 0, x: pos?.side === 'left' ? 8 : -8 }}
      animate={{ opacity: pos ? 1 : 0, x: 0, transition: { duration: duration.slow, ease: ease.out } }}
    >
      {children}
    </motion.div>,
    document.body,
  )
}
