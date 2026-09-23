import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import s from './Button.module.css'

type Variant = 'standard' | 'accent' | 'subtle'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  /** Square button with only an icon; pass an aria-label. */
  iconOnly?: boolean
}

export function Button({
  variant = 'standard',
  icon,
  iconOnly,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(s.button, s[variant], iconOnly && s.iconOnly, className)}
      {...rest}
    >
      {icon && <span className={s.icon}>{icon}</span>}
      {children}
    </button>
  )
}
