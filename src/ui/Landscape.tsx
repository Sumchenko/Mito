import { motion } from 'motion/react'
import { useMemo } from 'react'
import { duration, ease } from '@/design/motion'
import { cx } from '@/lib/cx'
import s from './Landscape.module.css'

const W = 1200
const H = 320

export type Daypart = 'morning' | 'day' | 'evening'

// eslint-disable-next-line react-refresh/only-export-components -- tiny helper tied to the scene palettes
export function daypartOf(hour: number): Daypart {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'day'
  return 'evening'
}

/** Deterministic PRNG so the landscape is identical on every render and device. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Peak {
  /** Horizontal position, 0..1. */
  at: number
  height: number
  /** Half-width of the slope, 0..1. */
  width: number
}

interface Ridge {
  seed: number
  base: number
  peaks: Peak[]
  rough: number
}

/** Concave slopes rising to a sharp summit — reads as a mountain, not a hill. */
function massif(x: number, peaks: Peak[]) {
  let h = 0
  for (const p of peaks) {
    const t = 1 - Math.abs(x - p.at) / p.width
    if (t > 0) h = Math.max(h, p.height * t ** 1.5)
  }
  return h
}

/** Massif silhouette plus midpoint-displacement noise for rugged, natural edges. */
function ridgePath({ seed, base, peaks, rough }: Ridge) {
  const rand = mulberry32(seed)
  const n = 128
  const noise = new Array<number>(n + 1).fill(0)
  let step = n
  let amp = 1
  while (step > 1) {
    const half = step / 2
    for (let i = half; i < n; i += step) {
      noise[i] = (noise[i - half]! + noise[i + half]!) / 2 + (rand() * 2 - 1) * amp
    }
    step = half
    amp *= 0.58
  }
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const x = i / n
    const y = base - massif(x, peaks) - noise[i]! * rough
    pts.push(`${(x * W).toFixed(1)},${y.toFixed(1)}`)
  }
  return `M0,${H} L${pts.join(' L')} L${W},${H} Z`
}

const ridges: Ridge[] = [
  {
    seed: 7,
    base: 228,
    peaks: [
      { at: 0.68, height: 168, width: 0.2 },
      { at: 0.52, height: 96, width: 0.12 },
      { at: 0.86, height: 118, width: 0.15 },
    ],
    rough: 9,
  },
  {
    seed: 21,
    base: 252,
    peaks: [
      { at: 0.42, height: 92, width: 0.17 },
      { at: 0.6, height: 58, width: 0.1 },
      { at: 0.97, height: 70, width: 0.12 },
    ],
    rough: 8,
  },
  {
    seed: 5,
    base: 278,
    peaks: [
      { at: 0.8, height: 74, width: 0.17 },
      { at: 0.28, height: 40, width: 0.14 },
    ],
    rough: 7,
  },
  {
    seed: 13,
    base: 306,
    peaks: [
      { at: 0.18, height: 40, width: 0.26 },
      { at: 0.62, height: 26, width: 0.22 },
    ],
    rough: 5,
  },
]

/** Stars for the night palette, placed once. */
const stars = (() => {
  const rand = mulberry32(99)
  return Array.from({ length: 28 }, () => ({
    x: rand() * W,
    y: rand() * 120,
    r: 0.6 + rand() * 1.1,
    o: 0.35 + rand() * 0.5,
  }))
})()

interface LandscapeProps {
  daypart: Daypart
  className?: string
}

/**
 * Minimal layered mountain scene. Colors come from CSS variables so it follows the time of day
 * in light theme and switches to a night palette in dark theme. Purely decorative.
 */
export function Landscape({ daypart, className }: LandscapeProps) {
  const paths = useMemo(() => ridges.map(ridgePath), [])

  return (
    <svg
      className={cx(s.landscape, s[daypart], className)}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="mito-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.skyTop} />
          <stop offset="1" className={s.skyBottom} />
        </linearGradient>
        <radialGradient id="mito-sun">
          <stop offset="0" className={s.sunCore} />
          <stop offset="0.25" className={s.sunCore} />
          <stop offset="1" className={s.sunGlow} />
        </radialGradient>
        <linearGradient id="mito-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={s.mistClear} />
          <stop offset="0.55" className={s.mistDense} />
          <stop offset="1" className={s.mistClear} />
        </linearGradient>
      </defs>

      <rect width={W} height={H} fill="url(#mito-sky)" />
      <g className={s.stars}>
        {stars.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />
        ))}
      </g>
      <circle className={s.sun} cx={W * 0.72} cy={82} r={120} fill="url(#mito-sun)" />

      {paths.map((d, i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0, y: 10 + i * 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.slower * 2.4, ease: ease.out, delay: 0.05 * i }}
        >
          <path d={d} className={s[`ridge${i + 1}`]} />
          {i < paths.length - 1 && (
            <rect
              className={s.mist}
              x={-100}
              y={ridges[i]!.base - 34}
              width={W + 200}
              height={70}
              fill="url(#mito-mist)"
            />
          )}
        </motion.g>
      ))}
    </svg>
  )
}
