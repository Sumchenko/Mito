import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { duration, ease } from '@/design/motion'
import { Button } from './Button'
import s from './Dialog.module.css'

interface DialogProps {
  open: boolean
  title: string
  children?: ReactNode
  primaryLabel: string
  secondaryLabel: string
  /** Paints the primary button as destructive. */
  danger?: boolean
  onPrimary: () => void
  onClose: () => void
}

/** Windows 11 ContentDialog: smoke layer, gentle scale-in, Esc and outside click close it. */
export function Dialog({
  open,
  title,
  children,
  primaryLabel,
  secondaryLabel,
  danger,
  onPrimary,
  onClose,
}: DialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    // Safe default: focus lands on the non-destructive action.
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={s.smoke}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: duration.normal } }}
          exit={{ opacity: 0, transition: { duration: duration.fast } }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={s.dialog}
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, scale: 1.02, transition: { duration: duration.fast, ease: ease.in } }}
          >
            <div className={s.body}>
              <h2 id={titleId} className={s.title}>
                {title}
              </h2>
              {children && <div className={s.content}>{children}</div>}
            </div>
            <div className={s.footer}>
              <Button
                variant="accent"
                className={danger ? s.danger : undefined}
                onClick={onPrimary}
              >
                {primaryLabel}
              </Button>
              <Button ref={cancelRef} onClick={onClose}>
                {secondaryLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
