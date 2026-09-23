import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { projectList } from '@/features/tasks/lists'
import { listPath } from '@/features/tasks/paths'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

const SHOWN = 6

/** How long finished tasks really took compared with their estimates. */
export function EstimatesSection({ data, fmt }: { data: StatsData; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { items, medianRatio, accurateShare } = data.report.estimates

  const verdict =
    medianRatio === null
      ? null
      : medianRatio > 1.2
        ? t('stats.estimates.under')
        : medianRatio < 1 / 1.2
          ? t('stats.estimates.over')
          : t('stats.estimates.good')

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.estimates.title')}</h3>
      </header>
      {medianRatio === null ? (
        <p className={s.empty}>{t('stats.estimates.empty')}</p>
      ) : (
        <>
          <p className={s.headline}>
            {t('stats.estimates.median', { value: fmt.percent(medianRatio) })}
          </p>
          <p className={s.subline}>
            {verdict} {accurateShare !== null && t('stats.estimates.accurate', { value: fmt.percent(accurateShare) })}
          </p>
          <ul className={s.estimates}>
            {items.slice(0, SHOWN).map((x) => {
              const task = data.taskById.get(x.taskId)
              const max = Math.max(x.estimateMs, x.trackedMs)
              const tint = data.projectTint(task?.projectId ?? null)
              return (
                <li key={x.taskId}>
                  <button
                    type="button"
                    className={s.estimateRow}
                    onClick={() => navigate(listPath(task?.projectId ? projectList(task.projectId) : 'inbox', x.taskId))}
                  >
                    <span className={s.rowName}>{task?.title ?? '—'}</span>
                    <span className={s.ratio} data-over={x.ratio > 1}>
                      {fmt.times(x.ratio)}
                    </span>
                    <span className={s.estimateBars}>
                      <span
                        className={s.estimateBar}
                        title={t('stats.estimates.estimate')}
                        style={{ width: `${(x.estimateMs / max) * 100}%` }}
                      />
                      <span
                        className={s.actualBar}
                        title={t('stats.estimates.actual')}
                        style={{ width: `${(x.trackedMs / max) * 100}%`, background: tint }}
                      />
                    </span>
                    <span className={s.estimateNums}>
                      {fmt.duration(x.estimateMs)} → {fmt.duration(x.trackedMs)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
