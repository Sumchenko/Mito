import { useId, useState, type ReactNode } from 'react'
import { useElementWidth } from '@/lib/useElementWidth'
import { labelEvery, timeTicks } from './scale'
import s from './charts.module.css'

export interface BarDatum {
  key: string
  label: string
  /** Stacked bottom-up. */
  segments: { key: string; tint: string; value: number }[]
  /** Dashed outline behind the bar — e.g. what was planned. */
  ghost?: number
  /** De-emphasised, e.g. days still ahead. */
  muted?: boolean
}

interface BarChartProps {
  data: BarDatum[]
  ariaLabel: string
  height?: number
  formatTick: (value: number) => string
  /** Dashed horizontal reference line. */
  average?: { value: number; label: string }
  /** Highlighted bar, e.g. today. */
  activeKey?: string
  tip?: (d: BarDatum) => ReactNode
  onSelect?: (d: BarDatum) => void
}

const PAD = { left: 44, right: 8, top: 10, bottom: 24 }

/** Vertical bars on a time axis, drawn in real pixels so labels stay crisp at any width. */
export function BarChart({ data, ariaLabel, height = 220, formatTick, average, activeKey, tip, onSelect }: BarChartProps) {
  const uid = useId()
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const totals = data.map((d) => d.segments.reduce((sum, x) => sum + x.value, 0))
  const max = Math.max(0, ...totals, ...data.map((d) => d.ghost ?? 0), average?.value ?? 0)
  const { top, ticks } = timeTicks(max)
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const slot = data.length ? plotW / data.length : 0
  const barW = Math.max(2, Math.min(40, slot * 0.62))
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const every = labelEvery(slot, 34)
  const hovered = hover !== null ? data[hover] : undefined

  return (
    <div ref={ref} className={s.chart} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {/* Grid */}
          {ticks.map((v) => (
            <g key={v}>
              <line className={s.grid} x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} />
              <text className={s.tick} x={PAD.left - 8} y={y(v)} dy="0.32em" textAnchor="end">
                {formatTick(v)}
              </text>
            </g>
          ))}
          <line className={s.axis} x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />

          {/* Bars grow from the baseline on mount. */}
          <g className={s.grow} style={{ transformOrigin: `0 ${y(0)}px` }}>
            {data.map((d, i) => {
              const x = PAD.left + slot * i + (slot - barW) / 2
              const total = totals[i]!
              const r = Math.min(4, barW / 2)
              const clip = `${uid}-b${i}`
              let acc = 0
              return (
                <g key={d.key} data-muted={d.muted} data-dim={hover !== null && hover !== i} className={s.bar}>
                  {d.ghost !== undefined && d.ghost > 0 && (
                    <rect
                      className={s.ghost}
                      x={x + 0.75}
                      y={y(d.ghost) + 0.75}
                      width={barW - 1.5}
                      height={Math.max(0, y(0) - y(d.ghost) - 0.75)}
                      rx={r}
                    />
                  )}
                  {total > 0 && (
                    <>
                      <clipPath id={clip}>
                        <path d={topRounded(x, y(total), barW, y(0) - y(total), r)} />
                      </clipPath>
                      <g clipPath={`url(#${clip})`}>
                        {d.segments.map((seg) => {
                          const y1 = y(acc + seg.value)
                          const y0 = y(acc)
                          acc += seg.value
                          return <rect key={seg.key} x={x} y={y1} width={barW} height={y0 - y1} fill={seg.tint} />
                        })}
                      </g>
                    </>
                  )}
                </g>
              )
            })}
          </g>

          {average && average.value > 0 && (
            <g className={s.average}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(average.value)} y2={y(average.value)} />
              <text x={width - PAD.right} y={y(average.value) - 5} textAnchor="end">
                {average.label}
              </text>
            </g>
          )}

          {/* Labels and hit areas. */}
          {data.map((d, i) => (
            <g key={d.key}>
              {(i % every === 0 || d.key === activeKey) && (
                <text
                  className={s.label}
                  data-active={d.key === activeKey}
                  x={PAD.left + slot * (i + 0.5)}
                  y={height - 6}
                  textAnchor="middle"
                >
                  {d.label}
                </text>
              )}
              <rect
                className={s.hit}
                data-clickable={!!onSelect}
                x={PAD.left + slot * i}
                y={PAD.top}
                width={slot}
                height={plotH}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => onSelect?.(d)}
              />
            </g>
          ))}
        </svg>
      )}
      {hovered && tip && hover !== null && (
        <div
          className={s.tip}
          style={{
            left: Math.min(Math.max(PAD.left + slot * (hover + 0.5), 80), width - 80),
            top: Math.max(0, y(Math.max(totals[hover]!, hovered.ghost ?? 0))) - 8,
          }}
        >
          {tip(hovered)}
        </div>
      )}
    </div>
  )
}

/** A bar outline with only the top corners rounded. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}
