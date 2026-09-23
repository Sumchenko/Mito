import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { dailyTracked } from '@/analytics'
import { addDays, startOfLocalDate, toLocalDate, useNow, useTaskEntries, type LocalDate, type Task } from '@/data'
import { formatDay, formatMinutes } from '@/lib/format'
import s from './tasks.module.css'

const DAYS = 14

/**
 * The task's own history: when it was worked on over the last two weeks, how often, and how
 * the time compares with the estimate. A parent counts its subtasks' time too.
 */
export function TaskActivity({ task, subtasks, today }: { task: Task; subtasks: Task[]; today: LocalDate }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const entries = useTaskEntries([task.id, ...subtasks.map((x) => x.id)])
  if (!entries) return null

  const minutes = (ms: number) => formatMinutes(Math.round(ms / 60_000), { h: t('common.h'), min: t('common.min') })
  const first = addDays(today, -(DAYS - 1))
  const daily = dailyTracked(entries, startOfLocalDate(first), startOfLocalDate(addDays(today, 1)), now)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(first, i))
  const max = Math.max(1, ...days.map((d) => daily.get(d) ?? 0))
  const total = entries.reduce((sum, e) => sum + ((e.end ?? now) - e.start), 0)
  const last = entries[entries.length - 1]
  const estimateMs = task.estimateMin ? task.estimateMin * 60_000 : 0
  const ratio = estimateMs ? total / estimateMs : 0
  const dayLabel = (d: LocalDate) => formatDay(d, today, i18n.language, t)

  return (
    <section className={s.activity}>
      <h3 className={s.fieldLabel}>
        {t('tasks.activity.title')}
        {subtasks.length > 0 && <span className={s.activityNote}> · {t('tasks.activity.withSubtasks')}</span>}
      </h3>

      {entries.length === 0 ? (
        <p className={s.activityEmpty}>{t('tasks.activity.never')}</p>
      ) : (
        <>
          <p className={s.activityLine}>
            <b>{minutes(total)}</b> · {t('tasks.activity.sessions', { count: entries.length })}
            {last && ` · ${t('tasks.activity.last', { date: dayLabel(toLocalDate(last.start)).toLowerCase() })}`}
          </p>

          {estimateMs > 0 && (
            <>
              <div className={s.estimateMeter} data-over={ratio > 1}>
                <span style={{ width: `${Math.min(1, ratio) * 100}%` }} />
              </div>
              <p className={s.estimateText}>
                {t('tasks.activity.ofEstimate', {
                  value: new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(ratio),
                  estimate: minutes(estimateMs),
                })}
              </p>
            </>
          )}

          <div className={s.spark} aria-label={t('tasks.activity.days')}>
            {days.map((d) => {
              const ms = daily.get(d) ?? 0
              return (
                <button
                  key={d}
                  type="button"
                  className={s.sparkDay}
                  data-today={d === today}
                  title={`${dayLabel(d)}: ${minutes(ms)}`}
                  onClick={() => navigate(`/calendar?date=${d}&view=day`)}
                >
                  <span style={{ height: ms ? `${Math.max(8, (ms / max) * 100)}%` : 0 }} />
                </button>
              )
            })}
          </div>
          <div className={s.sparkAxis}>
            <span>{dayLabel(first)}</span>
            <span>{t('common.today')}</span>
          </div>
        </>
      )}
    </section>
  )
}
