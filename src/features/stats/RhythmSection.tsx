import { useTranslation } from 'react-i18next'
import { useMediaQuery } from '@/lib/useMediaQuery'
import { HeatGrid } from '@/ui/charts/HeatGrid'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

/** A Monday of any year, to name weekdays in the current language. */
const MONDAY = new Date(2024, 0, 1)
const clock = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

/** When the work happens: weekday × hour, the peak, and session habits. */
export function RhythmSection({ data, fmt }: { data: StatsData; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const r = data.report
  // 24 hour columns are crumbs on a phone: there each column is two hours.
  const narrow = useMediaQuery('(max-width: 640px)')
  const span = narrow ? 2 : 1
  const heat = narrow
    ? r.heat.map((row) => Array.from({ length: 12 }, (_, i) => row[2 * i]! + row[2 * i + 1]!))
    : r.heat
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(fmt.lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)),
  )
  const longWeekday = (i: number) =>
    new Intl.DateTimeFormat(fmt.lang, { weekday: 'long' }).format(
      new Date(MONDAY.getFullYear(), 0, 1 + i),
    )

  // Peak: the busiest two consecutive hours of one weekday.
  let peak = { day: 0, hour: 0, ms: 0 }
  r.heat.forEach((row, day) =>
    row.forEach((ms, hour) => {
      const pair = ms + (row[hour + 1] ?? 0)
      if (pair > peak.ms) peak = { day, hour, ms: pair }
    }),
  )

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.rhythm.title')}</h3>
      </header>
      {r.trackedMs === 0 ? (
        <p className={s.empty}>{t('stats.time.empty')}</p>
      ) : (
        <>
          <p className={s.subline}>
            {t('stats.rhythm.peak', {
              day: longWeekday(peak.day),
              from: clock(peak.hour),
              to: clock(peak.hour + 2),
            })}
          </p>
          <HeatGrid
            values={heat}
            ariaLabel={t('stats.rhythm.heat')}
            rowLabels={weekdays}
            colLabels={Array.from({ length: 24 / span }, (_, i) =>
              i % 3 === 0 ? String(i * span) : null,
            )}
            tip={(row, col, ms) => (
              <div className={s.tipBody}>
                <b className={s.tipTitle}>
                  {longWeekday(row)}, {clock(col * span)}–{clock((col + 1) * span)}
                </b>
                <span className={s.tipTotal}>{fmt.duration(ms)}</span>
              </div>
            )}
          />
          <dl className={s.facts}>
            <div>
              <dt>{t('stats.rhythm.sessions')}</dt>
              <dd>
                {r.sessions}
                {r.pomodoros > 0 && (
                  <small>
                    {' '}
                    · {t('stats.rhythm.pomodoros')} {r.pomodoros}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('stats.rhythm.longestSession')}</dt>
              <dd>{fmt.duration(r.longestSessionMs)}</dd>
            </div>
            <div>
              <dt>{t('stats.rhythm.noTaskTime')}</dt>
              <dd>{fmt.duration(r.noTaskMs)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
