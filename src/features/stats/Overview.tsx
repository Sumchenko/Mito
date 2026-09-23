import {
  CalendarCheckmark20Regular,
  CheckmarkCircle20Regular,
  DataTrending20Regular,
  Target20Regular,
  Timer20Regular,
} from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { StatTile } from '@/ui/StatTile'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

/** Headline numbers with the change against the previous period of the same kind. */
export function Overview({ data, fmt }: { data: StatsData; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const { report: r, prev } = data
  const vs = t(`stats.vs.${r.period.kind}`)
  const delta = (cur: number, before: number) => {
    const d = fmt.delta(cur, before)
    return d ? `${d.text} ${vs}` : undefined
  }

  return (
    <div className={s.tiles}>
      <StatTile
        icon={<Timer20Regular />}
        tint="var(--tint-blue)"
        label={t('stats.tiles.tracked')}
        value={fmt.duration(r.trackedMs)}
        hint={delta(r.trackedMs, prev.trackedMs)}
      />
      <StatTile
        icon={<DataTrending20Regular />}
        tint="var(--tint-teal)"
        label={t('stats.tiles.avg')}
        value={fmt.duration(r.avgPerDayMs)}
        hint={delta(r.avgPerDayMs, prev.avgPerDayMs) ?? t('stats.tiles.avgHint', { count: r.elapsedDays })}
      />
      <StatTile
        icon={<CalendarCheckmark20Regular />}
        tint="var(--tint-violet)"
        label={t('stats.tiles.active')}
        value={r.activeDays}
        hint={t('stats.tiles.activeHint', { count: r.elapsedDays, streak: data.streak.current })}
      />
      <StatTile
        icon={<CheckmarkCircle20Regular />}
        tint="var(--tint-green)"
        label={t('stats.tiles.done')}
        value={r.tasksDone}
        hint={delta(r.tasksDone, prev.tasksDone)}
      />
      <StatTile
        icon={<Target20Regular />}
        tint="var(--tint-orange)"
        label={t('stats.tiles.plan')}
        value={r.plan.completion === null ? '—' : fmt.percent(r.plan.completion)}
        hint={
          r.plan.accuracy === null
            ? t('stats.tiles.noPlan')
            : t('stats.tiles.planHint', { value: fmt.percent(r.plan.accuracy) })
        }
        progress={r.plan.completion ?? undefined}
      />
    </div>
  )
}
