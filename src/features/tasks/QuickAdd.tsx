import {
  Add20Regular,
  CalendarLtr16Regular,
  Clock16Regular,
  Flag16Filled,
  Folder16Regular,
  Tag16Regular,
  Target16Regular,
} from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DomainError } from '@/data'
import { formatDay, formatMinutes } from '@/lib/format'
import { createFromQuickAdd, findProject } from './createTask'
import type { ListId } from './lists'
import { PRIORITY_COLOR } from './priority'
import { parseQuickAdd, type PartKind } from './quickAddParser'
import type { TasksData } from './useTasksData'
import s from './tasks.module.css'

export function QuickAdd({ list, data, onCreated }: {
  list: ListId
  data: TasksData
  onCreated?: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseQuickAdd(value, data.today), [value, data.today])

  const submit = async () => {
    if (!parsed.title) return
    try {
      const task = await createFromQuickAdd(parsed, {
        list,
        projects: data.projects,
        tags: data.tags,
        today: data.today,
      })
      setValue('')
      setError(null)
      if (task) onCreated?.(task.id)
    } catch (e) {
      setError(t(`errors.${e instanceof DomainError ? e.code : 'unknown'}`))
    }
  }

  const chips: { kind: PartKind; icon: ReactNode; label: string; tint?: string }[] = []
  if (parsed.projectName) {
    const existing = findProject(data.projects, parsed.projectName)
    chips.push({
      kind: 'project',
      icon: <Folder16Regular />,
      label: existing
        ? existing.name
        : `${parsed.projectName} · ${t('tasks.parts.newProject')}`,
      tint: existing ? `var(--tint-${existing.color})` : undefined,
    })
  }
  if (parsed.plannedDate) {
    chips.push({
      kind: 'planned',
      icon: <CalendarLtr16Regular />,
      label: formatDay(parsed.plannedDate, data.today, i18n.language, t),
    })
  }
  if (parsed.dueDate) {
    chips.push({
      kind: 'due',
      icon: <Target16Regular />,
      label: `${t('tasks.parts.due')}: ${formatDay(parsed.dueDate, data.today, i18n.language, t)}`,
    })
  }
  if (parsed.estimateMin) {
    chips.push({
      kind: 'estimate',
      icon: <Clock16Regular />,
      label: formatMinutes(parsed.estimateMin, { h: t('common.h'), min: t('common.min') }),
    })
  }
  if (parsed.priority) {
    chips.push({
      kind: 'priority',
      icon: <Flag16Filled />,
      label: t(`tasks.priority.${parsed.priority}`),
      tint: PRIORITY_COLOR[parsed.priority],
    })
  }
  for (const name of parsed.tagNames) {
    chips.push({ kind: 'tag', icon: <Tag16Regular />, label: name })
  }

  return (
    <div className={s.quickAdd} data-active={value.length > 0}>
      <div className={s.quickRow} onClick={() => input.current?.focus()}>
        <Add20Regular className={s.quickIcon} />
        <input
          ref={input}
          className={s.quickInput}
          value={value}
          placeholder={t('tasks.quickAddPlaceholder')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') setValue('')
          }}
          aria-label={t('tasks.quickAddPlaceholder')}
        />
        {parsed.title && <kbd className={s.kbd}>Enter</kbd>}
      </div>
      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <motion.div
            className={s.chips}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0, 0, 0, 1] }}
          >
            <div className={s.chipsInner}>
              {chips.map((c) => (
                <motion.span
                  key={c.kind + c.label}
                  layout
                  className={s.chip}
                  style={c.tint ? ({ '--chip-tint': c.tint } as CSSProperties) : undefined}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  {c.icon}
                  <span className={s.chipLabel}>{c.label}</span>
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className={s.error}>{error}</p>}
    </div>
  )
}
