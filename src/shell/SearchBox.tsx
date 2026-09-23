import { Search16Regular } from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useAllTasks, useProjects, type Task } from '@/data'
import { duration, ease } from '@/design/motion'
import { projectList } from '@/features/tasks/lists'
import { listPath } from '@/features/tasks/paths'
import s from './TitleBar.module.css'

const LIMIT = 8
const norm = (v: string) => v.toLowerCase().replace(/ё/g, 'е')

/** Title-bar search over tasks. Ctrl+K focuses it from anywhere. */
export function SearchBox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tasks = useAllTasks()
  const projects = useProjects(true)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        input.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q || !tasks) return []
    const hits = tasks.filter(
      (task) => task.status !== 'cancelled' && (norm(task.title).includes(q) || norm(task.notes ?? '').includes(q)),
    )
    // Title matches and open tasks first.
    const score = (task: Task) =>
      (norm(task.title).startsWith(q) ? 0 : norm(task.title).includes(q) ? 1 : 2) + (task.status === 'done' ? 3 : 0)
    return hits.sort((a, b) => score(a) - score(b)).slice(0, LIMIT)
  }, [query, tasks])

  const byId = useMemo(() => new Map((tasks ?? []).map((task) => [task.id, task])), [tasks])
  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects])

  const go = (task: Task) => {
    const owner = task.parentId ? byId.get(task.parentId) ?? task : task
    const list = owner.projectId ? projectList(owner.projectId) : 'inbox'
    navigate(listPath(list, task.id))
    setOpen(false)
    setQuery('')
    input.current?.blur()
  }

  const showPanel = open && query.trim().length > 0

  return (
    <div className={s.searchWrap}>
      <label className={s.search}>
        <Search16Regular className={s.searchIcon} />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder={t('titlebar.search')}
          aria-label={t('titlebar.search')}
          aria-expanded={showPanel}
          aria-controls="search-results"
          role="combobox"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results[active]) {
              go(results[active])
            } else if (e.key === 'Escape') {
              setQuery('')
              input.current?.blur()
            }
          }}
        />
        <kbd className={s.kbd}>Ctrl K</kbd>
      </label>

      <AnimatePresence>
        {showPanel && (
          <motion.ul
            id="search-results"
            role="listbox"
            className={s.results}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
          >
            {results.length === 0 && <li className={s.noResults}>{t('tasks.search.noResults')}</li>}
            {results.map((task, i) => {
              const owner = task.parentId ? byId.get(task.parentId) : undefined
              const project = projectById.get((owner ?? task).projectId ?? '')
              return (
                <li
                  key={task.id}
                  role="option"
                  aria-selected={i === active}
                  className={s.result}
                  data-done={task.status === 'done'}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    go(task)
                  }}
                >
                  <span
                    className={s.resultDot}
                    style={{ background: project ? `var(--tint-${project.color})` : 'var(--text-disabled)' }}
                  />
                  <span className={s.resultTitle}>{task.title}</span>
                  <span className={s.resultMeta}>
                    {owner ? owner.title : (project?.name ?? t('tasks.lists.inbox'))}
                  </span>
                </li>
              )
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
