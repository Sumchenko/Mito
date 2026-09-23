import { memo, type CSSProperties } from 'react'
import type { LocalDate } from '@/data'
import type { DayItems, DayStats } from './useZoomData'
import s from './zoom.module.css'

const DAY_MIN = 1440
/** Tracked minutes at which a heat cell reaches full intensity. */
const HEAT_FULL = 300
/** Planned minutes that fill the summary load bar. */
const LOAD_FULL = 480

interface DayTileProps {
  day: LocalDate
  items?: DayItems
  stats?: DayStats
  monthLabel?: string
  /** Formats minutes for the tile, e.g. "2ч 47м". */
  duration: (minutes: number) => string
  /**
   * Which representations to mount. Invisible ones are not rendered at all — at year zoom
   * that keeps ~400 tiles down to one element each, which is what keeps zooming fluid.
   */
  layers: { timeline: boolean; summary: boolean; heat: boolean }
}

/**
 * Everything one day can show, at every zoom level. Positions inside are percentages of the
 * tile, so zooming only resizes the tile; which representation is visible is controlled by
 * CSS variables on the zoom root (--timeline-o, --summary-o, --heat-o, --text-o).
 */
export const DayTile = memo(function DayTile({
  day,
  items,
  stats,
  monthLabel,
  duration,
  layers,
}: DayTileProps) {
  const dayNum = Number(day.slice(8))
  const heat = Math.min(1, (stats?.trackedMin ?? 0) / HEAT_FULL)

  return (
    <>
      {/* Close zoom: the day's timeline — plan blocks and the fact track. */}
      {layers.timeline && (
        <div className={s.timeline}>
          <div className={s.plan}>
            {items?.blocks.map(({ block, startMin, endMin, tint, title }) => (
              <div
                key={block.id}
                className={s.block}
                data-kind={block.kind}
                style={
                  {
                    '--block': tint,
                    top: `${(startMin / DAY_MIN) * 100}%`,
                    height: `${((endMin - startMin) / DAY_MIN) * 100}%`,
                  } as CSSProperties
                }
              >
                <span className={s.blockTitle}>{title}</span>
              </div>
            ))}
          </div>
          <div className={s.fact}>
            {items?.entries.map(({ entry, startMin, endMin, tint }) => (
              <div
                key={entry.id}
                className={s.factItem}
                style={
                  {
                    '--block': tint,
                    top: `${(startMin / DAY_MIN) * 100}%`,
                    height: `${((endMin - startMin) / DAY_MIN) * 100}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Middle zoom: a summary card — date, load by project, tracked time, titles. */}
      {layers.summary && (
        <div className={s.summary}>
          <div className={s.summaryHead}>
            <span className={s.dayNum}>{dayNum}</span>
            {monthLabel && <span className={s.monthTag}>{monthLabel}</span>}
            {stats && stats.trackedMin > 0 && (
              <span className={s.tracked}>{duration(stats.trackedMin)}</span>
            )}
          </div>
          {stats && stats.plannedMin > 0 && (
            <div
              className={s.load}
              style={{ width: `${Math.min(1, stats.plannedMin / LOAD_FULL) * 100}%` }}
            >
              {stats.planned.map((p) => (
                <span key={p.tint} style={{ flex: p.minutes, background: p.tint }} />
              ))}
            </div>
          )}
          {/* Fact under plan: how much of the day was actually tracked. */}
          {stats && stats.trackedMin > 0 && (
            <div
              className={s.factBar}
              style={{ width: `${Math.min(1, stats.trackedMin / LOAD_FULL) * 100}%` }}
            />
          )}
          <ul className={s.titles}>
            {stats?.titles.slice(0, 5).map((x, i) => (
              <li key={i}>
                <span style={{ background: x.tint }} />
                {x.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Far zoom: a heat cell — how much was actually done that day. */}
      {layers.heat && (
        <div className={s.heat} style={{ '--heat': heat } as CSSProperties}>
          <span className={s.heatNum}>{dayNum}</span>
        </div>
      )}
    </>
  )
})
