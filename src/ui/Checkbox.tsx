import { Checkmark12Filled } from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import type { CSSProperties } from 'react'
import { cx } from '@/lib/cx'
import s from './Checkbox.module.css'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  /** Color of the filled box; defaults to the accent. */
  color?: string
  round?: boolean
  className?: string
}

/** Task checkbox. The label is for screen readers; the row shows the visible title. */
export function Checkbox({ checked, onChange, label, color, round, className }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cx(s.box, round && s.round, className)}
      style={color ? ({ '--check': color } as CSSProperties) : undefined}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
    >
      <AnimatePresence initial={false}>
        {checked && (
          <motion.span
            className={s.mark}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 700, damping: 30 }}
          >
            <Checkmark12Filled />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
