import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { addDays, type LocalDate } from '@/data'
import { YearMap, type YearMapColumn } from '@/ui/charts/YearMap'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

/** A year of days at a glance, with streaks. A day opens in the calendar. */
export function ActivitySection({ data, fmt }: { data: StatsData; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { map, daily, today, report } = data

  const columns: YearMapColumn[] = []
  for (let monday = map.from; monday <= map.to; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    const first = days.find((d) => d.endsWith('-01'))
    columns.push({
      label: first ? fmt.monthShort(first) : undefined,
      cells: days.map((d) =>
        d < map.from || d > map.to
          ? null
          : { key: d, value: daily.get(d) ?? 0, today: d === today, future: d > today },
      ),
    })
  }
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    i % 2 === 0 ? new Intl.DateTimeFormat(fmt.lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)) : null,
  )
  const inPeriod = (d: string) => d >= report.period.from && d <= report.period.to

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.rhythm.year')}</h3>
        <dl className={s.streaks}>
          <div>
            <dt>{t('stats.rhythm.current')}</dt>
            <dd>{t('stats.rhythm.days', { count: data.streak.current })}</dd>
          </div>
          <div>
            <dt>{t('stats.rhythm.longest')}</dt>
            <dd>{t('stats.rhythm.days', { count: data.streak.longest })}</dd>
          </div>
        </dl>
      </header>
      <YearMap
        columns={columns}
        rowLabels={weekdays}
        ariaLabel={t('stats.rhythm.year')}
        tip={(cell) => (
          <div className={s.tipBody} data-in-period={inPeriod(cell.key)}>
            <b className={s.tipTitle}>{fmt.weekdayLong(cell.key as LocalDate)}</b>
            <span className={s.tipTotal}>{fmt.duration(cell.value)}</span>
          </div>
        )}
        onSelect={(cell) => navigate(`/calendar?date=${cell.key}&view=day`)}
      />
    </section>
  )
}
