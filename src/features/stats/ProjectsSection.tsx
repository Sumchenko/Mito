import { ChevronRight16Regular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { Id } from '@/data'
import { projectList } from '@/features/tasks/lists'
import { listPath } from '@/features/tasks/paths'
import { Donut } from '@/ui/charts/Donut'
import type { StatsFormat } from './format'
import type { StatsData } from './useStatsData'
import s from './stats.module.css'

const TASKS_SHOWN = 5
const keyOf = (id: Id | null) => id ?? '∅'

/** Where the time went: projects, and the tasks inside each, with a shared highlight. */
export function ProjectsSection({ data, fmt }: { data: StatsData; fmt: StatsFormat }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { report: r, prev } = data
  const [active, setActive] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const prevByProject = new Map(prev.projects.map((p) => [keyOf(p.projectId), p.ms]))

  const name = (id: Id | null) => (id ? (data.projectById.get(id)?.name ?? '—') : t('stats.projects.noProject'))
  const taskName = (id: Id | null) => (id ? (data.taskById.get(id)?.title ?? '—') : t('stats.projects.noTask'))
  const openTask = (taskId: Id) => {
    const task = data.taskById.get(taskId)
    navigate(listPath(task?.projectId ? projectList(task.projectId) : 'inbox', taskId))
  }

  if (r.trackedMs === 0) {
    return (
      <section className={s.card}>
        <header className={s.cardHead}>
          <h3 className={s.cardTitle}>{t('stats.projects.title')}</h3>
        </header>
        <p className={s.empty}>{t('stats.time.empty')}</p>
      </section>
    )
  }
  const activeProject = r.projects.find((p) => keyOf(p.projectId) === active)

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h3 className={s.cardTitle}>{t('stats.projects.title')}</h3>
      </header>
      <div className={s.projects}>
        <Donut
          ariaLabel={t('stats.projects.title')}
          segments={r.projects.map((p) => ({ key: keyOf(p.projectId), tint: data.projectTint(p.projectId), value: p.ms }))}
          activeKey={active}
          onHover={setActive}
          onSelect={(k) => setOpen((o) => (o === k ? null : k))}
        >
          <span className={s.donutValue}>{fmt.duration(activeProject?.ms ?? r.trackedMs)}</span>
          <span className={s.donutLabel}>
            {activeProject ? name(activeProject.projectId) : t('stats.tiles.tracked')}
          </span>
        </Donut>

        <ul className={s.projectList} onPointerLeave={() => setActive(null)}>
          {r.projects.map((p) => {
            const k = keyOf(p.projectId)
            const expanded = open === k
            const delta = fmt.delta(p.ms, prevByProject.get(k) ?? 0)
            const tasks = showAll && expanded ? p.tasks : p.tasks.slice(0, TASKS_SHOWN)
            return (
              <li key={k} data-dim={!!active && active !== k}>
                <button
                  type="button"
                  className={s.projectRow}
                  aria-expanded={expanded}
                  onPointerEnter={() => setActive(k)}
                  onClick={() => {
                    setOpen(expanded ? null : k)
                    setShowAll(false)
                  }}
                >
                  <ChevronRight16Regular className={s.chevron} />
                  <i className={s.dot} style={{ background: data.projectTint(p.projectId) }} />
                  <span className={s.rowName}>{name(p.projectId)}</span>
                  {delta && (
                    <span className={s.rowDelta} data-dir={delta.dir}>
                      {delta.text}
                    </span>
                  )}
                  <span className={s.rowShare}>{fmt.percent(p.ms / r.trackedMs)}</span>
                  <span className={s.rowTime}>{fmt.duration(p.ms)}</span>
                  <span className={s.rowBar}>
                    <span style={{ width: `${(p.ms / r.projects[0]!.ms) * 100}%`, background: data.projectTint(p.projectId) }} />
                  </span>
                </button>
                {expanded && (
                  <ul className={s.taskRows}>
                    {tasks.map((x) => (
                      <li key={keyOf(x.taskId)}>
                        <button
                          type="button"
                          className={s.taskRow}
                          disabled={!x.taskId}
                          onClick={() => x.taskId && openTask(x.taskId)}
                        >
                          <span className={s.rowName}>{taskName(x.taskId)}</span>
                          <span className={s.rowTime}>{fmt.duration(x.ms)}</span>
                          <span className={s.rowBar}>
                            <span
                              style={{ width: `${(x.ms / p.tasks[0]!.ms) * 100}%`, background: data.projectTint(p.projectId) }}
                            />
                          </span>
                        </button>
                      </li>
                    ))}
                    {!showAll && p.tasks.length > TASKS_SHOWN && (
                      <li>
                        <button type="button" className={s.more} onClick={() => setShowAll(true)}>
                          {t('stats.projects.more', { count: p.tasks.length - TASKS_SHOWN })}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {r.tags.length > 0 && (
        <div className={s.tags}>
          <span className={s.tagsTitle}>{t('stats.projects.tags')}</span>
          {r.tags.slice(0, 8).map((tag) => {
            const info = data.tagById.get(tag.tagId)
            return (
              <span key={tag.tagId} className={s.tag} style={{ color: info ? `var(--tint-${info.color})` : undefined }}>
                #{info?.name ?? '—'} <em>{fmt.duration(tag.ms)}</em>
              </span>
            )
          })}
        </div>
      )}
    </section>
  )
}
