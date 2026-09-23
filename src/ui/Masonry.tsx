import { Children, isValidElement, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { packColumns, type MasonryLayout } from './masonryLayout'
import s from './Masonry.module.css'

interface MasonryProps {
  children: ReactNode
  columns?: number
  gap?: number
  /** Below this media query everything stacks in one column. */
  stackQuery?: string
}

/**
 * Cards of varying height in columns without holes: each card goes to the shorter column
 * and the last card of each column stretches so the columns end together.
 *
 * Laid out on a CSS grid with 1px rows, so items keep their place in the tree (and their
 * state) when they move between columns. Heights are measured from the cards' content,
 * not their box, so stretching a card never feeds back into the layout.
 */
export function Masonry({ children, columns = 2, gap = 12, stackQuery = '(max-width: 960px)' }: MasonryProps) {
  const stacked = useMediaQuery(stackQuery)
  const items = Children.toArray(children).filter(isValidElement)
  const root = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<MasonryLayout | null>(null)
  const count = items.length

  useLayoutEffect(() => {
    const el = root.current
    if (!el || stacked) return
    const measure = () => {
      const heights = [...el.children].map((item) => naturalHeight(item.firstElementChild as HTMLElement | null))
      const next = packColumns(heights, columns, gap)
      setLayout((prev) => (prev && same(prev, next) ? prev : next))
    }
    measure()
    // Cards resize with their content and the window; content can also change inside a
    // stretched card without resizing it, which only the mutation observer notices.
    const ro = new ResizeObserver(measure)
    for (const item of el.children) if (item.firstElementChild) ro.observe(item.firstElementChild)
    const mo = new MutationObserver(measure)
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [stacked, columns, gap, count])

  const ready = !stacked && layout && layout.spans.length === count
  return (
    <div
      ref={root}
      className={s.masonry}
      data-mode={stacked ? 'stack' : ready ? 'grid' : 'measure'}
      style={{ '--cols': columns, '--gap': `${gap}px` } as CSSProperties}
    >
      {items.map((child, i) => (
        <div
          key={child.key ?? i}
          className={s.item}
          style={
            ready
              ? { gridColumn: layout.columns[i]! + 1, gridRowEnd: `span ${layout.spans[i]}` }
              : stacked
                ? undefined
                : { gridColumn: (i % columns) + 1 }
          }
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/** Height of a card's content: from its top to its last child's bottom, plus padding. */
function naturalHeight(el: HTMLElement | null) {
  if (!el) return 0
  const last = el.lastElementChild as HTMLElement | null
  if (!last) return el.offsetHeight
  const box = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  const lastStyle = getComputedStyle(last)
  return (
    last.getBoundingClientRect().bottom -
    box.top +
    parseFloat(lastStyle.marginBottom) +
    parseFloat(style.paddingBottom) +
    parseFloat(style.borderBottomWidth)
  )
}

const same = (a: MasonryLayout, b: MasonryLayout) =>
  a.columns.length === b.columns.length &&
  a.columns.every((c, i) => c === b.columns[i]) &&
  a.spans.every((h, i) => Math.abs(h - b.spans[i]!) < 1)
