import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { BarChart } from '@/ui/charts/BarChart'
import { Gauge } from '@/ui/charts/Gauge'
import { calendarLink, type Bucket } from './buckets'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

const ON_TIME = 'var(--accent)'
const LATE = 'color-mix(in srgb, var(--accent) 40%, transparent)'

/**
 * Plan against fact, two ways: was the planned work done that day at all (completion),
 * and was it done at the planned hours (accuracy).
 */
export function PlanSection({ data, buckets, fmt }: { data: StatsData; buckets: Bucket[]; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { plan } = data.report
  const byKey = new Map<string, Bucket>(buckets.map((b) => [b.key, b]))

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.plan.title')}</h3>
      </header>
      {plan.plannedMs === 0 ? (
        <p className={s.empty}>{t('stats.plan.empty')}</p>
      ) : (
        <>
          <div className={s.gauges}>
            <figure className={s.gauge}>
              <Gauge value={plan.completion} tint={ON_TIME} ariaLabel={t('stats.plan.completion')}>
                <span className={s.gaugeValue}>{fmt.percent(plan.completion ?? 0)}</span>
              </Gauge>
              <figcaption>
                <b>{t('stats.plan.completion')}</b>
                <span>{t('stats.plan.completionHint')}</span>
              </figcaption>
            </figure>
            <figure className={s.gauge}>
              <Gauge value={plan.accuracy} tint="var(--tint-teal)" ariaLabel={t('stats.plan.accuracy')}>
                <span className={s.gaugeValue}>{fmt.percent(plan.accuracy ?? 0)}</span>
              </Gauge>
              <figcaption>
                <b>{t('stats.plan.accuracy')}</b>
                <span>{t('stats.plan.accuracyHint')}</span>
              </figcaption>
            </figure>
          </div>

          <dl className={s.facts}>
            <div>
              <dt>{t('stats.plan.planned')}</dt>
              <dd>{fmt.duration(plan.plannedMs)}</dd>
            </div>
            <div>
              <dt>{t('stats.plan.done')}</dt>
              <dd>{fmt.duration(plan.doneMs)}</dd>
            </div>
            <div>
              <dt>{t('stats.plan.onTime')}</dt>
              <dd>{fmt.duration(plan.onTimeMs)}</dd>
            </div>
            <div>
              <dt>{t('stats.plan.unplanned')}</dt>
              <dd>{fmt.duration(plan.unplannedMs)}</dd>
            </div>
          </dl>

          <BarChart
            key={`${data.report.period.from}-${data.report.period.to}`}
            height={170}
            ariaLabel={t('stats.plan.title')}
            formatTick={fmt.tick}
            activeKey={buckets[0]?.kind === 'day' ? data.today : undefined}
            data={buckets.map((b) => ({
              key: b.key,
              label:
                b.kind === 'month'
                  ? fmt.monthShort(b.key)
                  : buckets.length <= 7
                    ? new Intl.DateTimeFormat(fmt.lang, { weekday: 'short' }).format(new Date(`${b.key}T12:00`))
                    : b.kind === 'week'
                      ? fmt.dayShort(b.key)
                      : String(Number(b.key.slice(8))),
              ghost: b.plannedMs,
              muted: b.key > data.today,
              segments: [
                { key: 'on', tint: ON_TIME, value: b.onTimeMs },
                { key: 'late', tint: LATE, value: b.doneMs - b.onTimeMs },
              ],
            }))}
            onSelect={(d) => navigate(calendarLink(byKey.get(d.key)!))}
            tip={(d) => {
              const b = byKey.get(d.key)!
              return (
                <div className={s.tipBody}>
                  <b className={s.tipTitle}>{b.kind === 'day' ? fmt.weekdayLong(b.key) : fmt.dayMonth(b.key)}</b>
                  <span className={s.tipRow}>
                    {t('stats.plan.planned')} <em>{fmt.duration(b.plannedMs)}</em>
                  </span>
                  <span className={s.tipRow}>
                    <i style={{ background: LATE }} />
                    {t('stats.plan.done')} <em>{fmt.duration(b.doneMs)}</em>
                  </span>
                  <span className={s.tipRow}>
                    <i style={{ background: ON_TIME }} />
                    {t('stats.plan.onTime')} <em>{fmt.duration(b.onTimeMs)}</em>
                  </span>
                </div>
              )
            }}
          />
          <div className={s.legend}>
            <span>
              <i className={s.legendGhost} />
              {t('stats.plan.legendPlan')}
            </span>
            <span>
              <i style={{ background: LATE }} />
              {t('stats.plan.legendDone')}
            </span>
            <span>
              <i style={{ background: ON_TIME }} />
              {t('stats.plan.legendOnTime')}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
