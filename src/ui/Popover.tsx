import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { duration, ease } from '@/design/motion'
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

/**
 * Flyout attached beside a rectangle: right of it when there is room, otherwise left, and
 * clamped into the viewport. Closes on Esc and outside press.
 */
export function Popover({ anchor, onClose, children, width = 320, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; side: 'left' | 'right' }>()

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 0
    const fitsRight = anchor.right + GAP + width + MARGIN <= window.innerWidth
    const left = fitsRight
      ? anchor.right + GAP
      : Math.max(MARGIN, anchor.left - GAP - width)
    const top = Math.min(Math.max(MARGIN, anchor.top), window.innerHeight - height - MARGIN)
    setPos({ left, top, side: fitsRight ? 'right' : 'left' })
  }, [anchor, width])

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
