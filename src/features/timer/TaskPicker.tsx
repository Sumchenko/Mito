import { ChevronDown16Regular, Search16Regular } from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toLocalDate, useAllTasks, useProjects, type Id, type Task } from '@/data'
import { duration, ease } from '@/design/motion'
import s from './timer.module.css'

const norm = (v: string) => v.toLowerCase().replace(/ё/g, 'е')

interface TaskPickerProps {
  value?: Id
  onChange: (taskId: Id | undefined) => void
}

/** Searchable task chooser: today's plan first, then every other open task. */
export function TaskPicker({ value, onChange }: TaskPickerProps) {
  const { t } = useTranslation()
  const tasks = useAllTasks()
  const projects = useProjects(true)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const projectById = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p])), [projects])
  const byId = useMemo(() => new Map((tasks ?? []).map((x) => [x.id, x])), [tasks])
  const selected = value ? byId.get(value) : undefined

  const options = useMemo(() => {
    const today = toLocalDate()
    const q = norm(query.trim())
    const openTasks = (tasks ?? []).filter(
      (x) => x.status === 'open' && (!q || norm(x.title).includes(q)),
    )
    const planned = (x: Task) => (x.plannedDate !== undefined && x.plannedDate <= today ? 0 : 1)
    return openTasks.sort((a, b) => planned(a) - planned(b) || a.order - b.order).slice(0, 40)
  }, [tasks, query])

  const dotOf = (task?: Task) => {
    const owner = task?.parentId ? byId.get(task.parentId) : task
    const project = owner?.projectId ? projectById.get(owner.projectId) : undefined
    return project ? `var(--tint-${project.color})` : 'var(--text-disabled)'
  }

  const pick = (id: Id | undefined) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={root} className={s.picker}>
      <button type="button" className={s.pickerButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={s.pickerDot} style={{ background: dotOf(selected) }} />
        <span className={s.pickerLabel}>{selected?.title ?? t('timer.noTask')}</span>
        <ChevronDown16Regular />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className={s.pickerPanel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: duration.slow, ease: ease.out } }}
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
          >
            <label className={s.pickerSearch}>
              <Search16Regular />
              <input
                autoFocus
                value={query}
                placeholder={t('timer.searchTasks')}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && options[0] && pick(options[0].id)}
              />
            </label>
            <ul className={s.pickerList} role="listbox">
              <li role="option" aria-selected={!value} className={s.pickerOption} onClick={() => pick(undefined)}>
                <span className={s.pickerDot} />
                {t('timer.noTask')}
              </li>
              {options.map((task) => (
                <li
                  key={task.id}
                  role="option"
                  aria-selected={task.id === value}
                  className={s.pickerOption}
                  onClick={() => pick(task.id)}
                >
                  <span className={s.pickerDot} style={{ background: dotOf(task) }} />
                  <span className={s.pickerLabel}>{task.title}</span>
                  {task.parentId && <span className={s.pickerMeta}>{byId.get(task.parentId)?.title}</span>}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
