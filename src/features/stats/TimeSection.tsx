import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { BarChart, type BarDatum } from '@/ui/charts/BarChart'
import { calendarLink, type Bucket } from './buckets'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

/** Tracked time per day (or week, or month), stacked by project, against the average. */
export function TimeSection({ data, buckets, fmt }: { data: StatsData; buckets: Bucket[]; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { report: r, today } = data
  const order = r.projects.map((p) => p.projectId)
  const started = buckets.filter((b) => b.key <= today)
  const avg = started.length ? started.reduce((sum, b) => sum + b.trackedMs, 0) / started.length : 0
  const kind = buckets[0]?.kind ?? 'day'

  const label = (b: Bucket) => {
    if (kind === 'month') return fmt.monthShort(b.key)
    if (kind === 'week') return fmt.dayShort(b.key)
    // A week reads best by weekday, a month by date.
    return buckets.length <= 7
      ? new Intl.DateTimeFormat(fmt.lang, { weekday: 'short' }).format(new Date(`${b.key}T12:00`))
      : String(Number(b.key.slice(8)))
  }
  const title = (b: Bucket) =>
    kind === 'day'
      ? fmt.weekdayLong(b.key)
      : kind === 'week'
        ? t('stats.time.weekOf', { date: fmt.dayMonth(b.key) })
        : new Intl.DateTimeFormat(fmt.lang, { month: 'long', year: 'numeric' }).format(new Date(`${b.key}T12:00`))

  const chart: BarDatum[] = buckets.map((b) => ({
    key: b.key,
    label: label(b),
    muted: b.key > today,
    segments: order
      .filter((p) => b.byProject.get(p))
      .map((p) => ({ key: String(p), tint: data.projectTint(p), value: b.byProject.get(p)! })),
  }))
  const byKey = new Map<string, Bucket>(buckets.map((b) => [b.key, b]))

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.time.title')}</h3>
        <span className={s.cardHint}>{kind === 'day' ? t('stats.time.hint') : t('stats.time.hintLong')}</span>
      </header>
      {r.trackedMs === 0 ? (
        <p className={s.empty}>{t('stats.time.empty')}</p>
      ) : (
        <BarChart
          key={`${r.period.from}-${r.period.to}`}
          data={chart}
          ariaLabel={t('stats.time.title')}
          formatTick={fmt.tick}
          activeKey={kind === 'day' ? today : undefined}
          average={{ value: avg, label: t('stats.time.average', { value: fmt.duration(avg) }) }}
          onSelect={(d) => navigate(calendarLink(byKey.get(d.key)!))}
          tip={(d) => {
            const b = byKey.get(d.key)!
            const top = order.filter((p) => b.byProject.get(p)).slice(0, 4)
            return (
              <div className={s.tipBody}>
                <b className={s.tipTitle}>{title(b)}</b>
                <span className={s.tipTotal}>{fmt.duration(b.trackedMs)}</span>
                {top.map((p) => (
                  <span key={String(p)} className={s.tipRow}>
                    <i style={{ background: data.projectTint(p) }} />
                    {p ? data.projectById.get(p)?.name : t('stats.projects.noProject')}
                    <em>{fmt.duration(b.byProject.get(p)!)}</em>
                  </span>
                ))}
              </div>
            )
          }}
        />
      )}
    </section>
  )
}
