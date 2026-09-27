import { CheckmarkFilled } from '@fluentui/react-icons'
import { memo, type CSSProperties } from 'react'
import { tasksRepo, type LocalDate } from '@/data'
import { KindIcon } from '../KindIcon'
import type { DayItems, DayStats } from './useZoomData'
import s from './zoom.module.css'

const DAY_MIN = 1440
/** Tracked minutes at which a heat cell reaches full intensity. */
const HEAT_FULL = 300
/** Planned minutes that fill the summary load bar. */
const LOAD_FULL = 480

const pct = (minutes: number) => `${(minutes / DAY_MIN) * 100}%`
const clock = (minutes: number) => {
  const m = Math.round(minutes)
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

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
  /** A block being dragged elsewhere is hidden at its original place. */
  hiddenBlockId?: string
  /** Touch: the block picked up by a long press — shown with large resize handles. */
  selectedBlockId?: string
}

/**
 * Everything one day can show, at every zoom level. Positions inside are percentages of the
 * tile, so zooming only resizes the tile; which representation is visible is controlled by
 * CSS variables on the zoom root (--timeline-o, --summary-o, --heat-o, --text-o).
 * Blocks carry data attributes; the zoom surface handles pointer events by delegation.
 */
export const DayTile = memo(function DayTile({
  day,
  items,
  stats,
  monthLabel,
  duration,
  layers,
  hiddenBlockId,
  selectedBlockId,
}: DayTileProps) {
  const dayNum = Number(day.slice(8))
  const heat = Math.min(1, (stats?.trackedMin ?? 0) / HEAT_FULL)

  return (
    <>
      {/* Close zoom: the day's timeline — plan blocks and the fact track (a strip or a column). */}
      {layers.timeline && (
        <div className={s.timeline}>
          <div className={s.plan}>
            {items?.blocks.map(({ block, startMin, endMin, tint, title, done, lane, lanes }) =>
              block.id === hiddenBlockId ? null : (
                <div
                  key={block.id}
                  className={s.block}
                  data-kind={block.kind}
                  data-done={done}
                  data-selected={block.id === selectedBlockId}
                  data-block-id={block.id}
                  data-day={day}
                  data-start={startMin}
                  data-end={endMin}
                  style={
                    {
                      '--block': tint,
                      top: pct(startMin),
                      height: pct(endMin - startMin),
                      left: `calc(${(lane / lanes) * 100}% + 1px)`,
                      width: `calc(${100 / lanes}% - 2px)`,
                    } as CSSProperties
                  }
                >
                  <span className={s.edgeTop} data-edge="start" />
                  <span className={s.blockTitle}>
                    {/* A task can be ticked off right here; anything else shows what it is. */}
                    {block.kind === 'task' && block.taskId ? (
                      <button
                        type="button"
                        className={s.blockCheck}
                        data-chrome
                        aria-pressed={done}
                        aria-label={title}
                        onClick={() => void tasksRepo.setStatus(block.taskId!, done ? 'open' : 'done')}
                      >
                        {done && <CheckmarkFilled />}
                      </button>
                    ) : block.kind !== 'task' ? (
                      <KindIcon kind={block.kind} className={s.blockIcon} />
                    ) : null}
                    {title}
                  </span>
                  <span className={s.blockTime}>
                    {clock(startMin)}–{clock(endMin)}
                  </span>
                  <span className={s.edgeBottom} data-edge="end" />
                </div>
              ),
            )}
          </div>
          <div className={s.fact}>
            {items?.entries.map(({ entry, startMin, endMin, tint, title }) => (
              <div
                key={entry.id}
                className={s.factItem}
                data-running={entry.end === null}
                data-entry-id={entry.id}
                style={{ '--block': tint, top: pct(startMin), height: pct(endMin - startMin) } as CSSProperties}
              >
                {/* Shown only when the fact column is expanded. */}
                <span className={s.factTitle}>{title}</span>
                <span className={s.factTime}>
                  {clock(startMin)}–{clock(endMin)}
                </span>
              </div>
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
            {stats && stats.trackedMin > 0 && <span className={s.tracked}>{duration(stats.trackedMin)}</span>}
          </div>
          {stats && stats.plannedMin > 0 && (
            <div className={s.load} style={{ width: `${Math.min(1, stats.plannedMin / LOAD_FULL) * 100}%` }}>
              {stats.planned.map((p) => (
                <span key={p.tint} style={{ flex: p.minutes, background: p.tint }} />
              ))}
            </div>
          )}
          {/* Fact under plan: how much of the day was actually tracked. */}
          {stats && stats.trackedMin > 0 && (
            <div className={s.factBar} style={{ width: `${Math.min(1, stats.trackedMin / LOAD_FULL) * 100}%` }} />
          )}
          <ul className={s.titles}>
            {stats?.titles.slice(0, 5).map((x, i) => (
              <li key={i}>
                <span style={{ background: x.tint }} />
                {x.title}
              </li>
            ))}
            {/* Planned for the day without a time: a hollow dot. */}
            {stats?.dated.slice(0, Math.max(0, 5 - stats.titles.length)).map((x, i) => (
              <li key={`d${i}`} data-dated>
                <span style={{ borderColor: x.tint }} />
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
