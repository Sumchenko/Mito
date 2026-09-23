import type { Transition } from 'motion/react'

/** Motion presets mirroring the CSS tokens so JS- and CSS-driven animations feel identical. */
export const duration = {
  fast: 0.083,
  normal: 0.167,
  slow: 0.25,
  slower: 0.333,
} as const

export const ease = {
  out: [0, 0, 0, 1],
  in: [1, 0, 1, 1],
  standard: [0.33, 0, 0.1, 1],
} as const

/** Critically damped spring — moves decisively, never overshoots. */
export const springFirm: Transition = { type: 'spring', stiffness: 520, damping: 44, mass: 1 }

/** Softer spring for larger surfaces (panels, zoom). */
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 32, mass: 1 }

/** Page entrance: short upward slide + fade, like Windows 11 page navigation. */
export const pageTransition = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.slower, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease: ease.in } },
}
