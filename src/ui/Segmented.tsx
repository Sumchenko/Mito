import { motion } from 'motion/react'
import { useId } from 'react'
import { springFirm } from '@/design/motion'
import s from './Segmented.module.css'

interface SegmentedProps<T extends string> {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
  'aria-label': string
}

/** Radio group rendered as a segmented control with a sliding selection pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ...aria
}: SegmentedProps<T>) {
  const id = useId()
  return (
    <div role="radiogroup" className={s.root} aria-label={aria['aria-label']}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={s.item}
            data-selected={selected}
            onClick={() => onChange(o.value)}
          >
            {selected && (
              <motion.span layoutId={`seg-${id}`} className={s.pill} transition={springFirm} />
            )}
            <span className={s.label}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}
