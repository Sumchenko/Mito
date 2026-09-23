import {
  Add16Regular,
  CalendarLtr20Regular,
  CalendarToday20Regular,
  Mail20Regular,
  TaskListSquareLtr20Regular,
} from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, useNavigate } from 'react-router'
import { projectsRepo } from '@/data'
import { springFirm } from '@/design/motion'
import f from '@/ui/fields.module.css'
import { countLists, projectList, type ListId } from './lists'
import { listPath } from './paths'
import type { TasksData } from './useTasksData'
import s from './tasks.module.css'

const SMART: { list: ListId; icon: ReactNode }[] = [
  { list: 'inbox', icon: <Mail20Regular /> },
  { list: 'today', icon: <CalendarToday20Regular /> },
  { list: 'upcoming', icon: <CalendarLtr20Regular /> },
  { list: 'all', icon: <TaskListSquareLtr20Regular /> },
]

export function ListsPane({ data }: { data: TasksData }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const counts = useMemo(
    () => countLists(data.tasks, data.projects.map((p) => p.id), data.today),
    [data.tasks, data.projects, data.today],
  )

  const createProject = async (name: string) => {
    setAdding(false)
    if (!name.trim()) return
    const project = await projectsRepo.create({ name })
    navigate(listPath(projectList(project.id)))
  }

  return (
    <nav className={s.pane} aria-label={t('nav.tasks')}>
      {SMART.map(({ list, icon }) => (
        <PaneLink key={list} list={list} icon={icon} label={t(`tasks.lists.${list as 'inbox'}`)} count={counts[list]} />
      ))}

      <div className={s.paneHeader}>
        <span>{t('tasks.projects')}</span>
        <button
          type="button"
          className={s.paneAdd}
          aria-label={t('tasks.newProject')}
          title={t('tasks.newProject')}
          onClick={() => setAdding(true)}
        >
          <Add16Regular />
        </button>
      </div>

      {data.projects.map((p) => (
        <PaneLink
          key={p.id}
          list={projectList(p.id)}
          icon={<span className={s.paneDot} style={{ background: `var(--tint-${p.color})` }} />}
          label={p.name}
          count={counts[projectList(p.id)]}
        />
      ))}

      {adding && (
        <input
          className={f.control}
          autoFocus
          placeholder={t('tasks.newProjectPlaceholder')}
          aria-label={t('tasks.newProject')}
          onBlur={(e) => void createProject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setAdding(false)
          }}
        />
      )}
    </nav>
  )
}

function PaneLink({ list, icon, label, count }: { list: ListId; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink to={listPath(list)} className={s.paneItem}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="tasks-pane-indicator" className={s.paneIndicator} transition={springFirm} />}
          <span className={s.paneIcon}>{icon}</span>
          <span className={s.paneLabel}>{label}</span>
          {!!count && <span className={s.paneCount}>{count}</span>}
        </>
      )}
    </NavLink>
  )
}
