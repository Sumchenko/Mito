import {
  Add16Regular,
  CalendarLtrRegular,
  ChevronRightRegular,
  ClockRegular,
  FlagFilled,
  ReOrderDotsVertical16Regular,
  TargetRegular,
  TaskListLtrRegular,
} from '@fluentui/react-icons'
import { AnimatePresence, Reorder, useDragControls } from 'motion/react'
import { useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { tasksRepo, type Task } from '@/data'
import { springFirm } from '@/design/motion'
import { formatDay, formatMinutes } from '@/lib/format'
import { Checkbox } from '@/ui/Checkbox'
import { useExpanded } from './expanded'
import { InlineSubtasks } from './InlineSubtasks'
import { projectIdOf, type ListId } from './lists'
import { PRIORITY_COLOR } from './priority'
import type { TasksData } from './useTasksData'
import s from './tasks.module.css'

interface TaskRowProps {
  task: Task
  list: ListId
  data: TasksData
  selected: boolean
  onSelect: (id: string) => void
  /** Rows in reorderable lists get a drag handle. */
  reorderable?: boolean
  onDragEnd?: () => void
}

export function TaskRow({ task, list, data, selected, onSelect, reorderable, onDragEnd }: TaskRowProps) {
  const { t, i18n } = useTranslation()
  const controls = useDragControls()
  const done = task.status === 'done'
  const today = data.today
  const project = task.projectId ? data.projectById.get(task.projectId) : undefined
  const parent = task.parentId ? data.taskById.get(task.parentId) : undefined
  const progress = data.progress.get(task.id)
  const day = (d: Parameters<typeof formatDay>[0]) => formatDay(d, today, i18n.language, t)
  const expanded = useExpanded((st) => !!st.ids[task.id])
  const setExpanded = useExpanded((st) => st.setExpanded)
  const [focusAdd, setFocusAdd] = useState(false)
  const canHaveSubtasks = !task.parentId
  const subtasks = expanded ? data.tasks.filter((x) => x.parentId === task.id) : []

  const meta: { key: string; node: ReactNode; tone?: 'danger' | 'warning' }[] = []
  if (parent) meta.push({ key: 'parent', node: t('tasks.subtaskOf', { title: parent.title }) })
  if (project && projectIdOf(list) !== project.id) {
    meta.push({
      key: 'project',
      node: (
        <>
          <span className={s.dot} style={{ background: `var(--tint-${project.color})` }} />
          {project.name}
        </>
      ),
    })
  }
  if (task.plannedDate && (list !== 'today' || task.plannedDate < today)) {
    meta.push({
      key: 'planned',
      tone: !done && task.plannedDate < today ? 'danger' : undefined,
      node: (
        <>
          <CalendarLtrRegular />
          {day(task.plannedDate)}
        </>
      ),
    })
  }
  if (task.dueDate) {
    const late = !done && task.dueDate < today
    const soon = !done && task.dueDate === today
    meta.push({
      key: 'due',
      tone: late ? 'danger' : soon ? 'warning' : undefined,
      node: (
        <>
          <TargetRegular />
          {day(task.dueDate)}
        </>
      ),
    })
  }
  if (task.estimateMin) {
    meta.push({
      key: 'estimate',
      node: (
        <>
          <ClockRegular />
          {formatMinutes(task.estimateMin, { h: t('common.h'), min: t('common.min') })}
        </>
      ),
    })
  }
  for (const tagId of task.tagIds) {
    const tag = data.tagById.get(tagId)
    if (tag) {
      meta.push({
        key: `tag-${tag.id}`,
        node: <span style={{ color: `var(--tint-${tag.color})` }}>@{tag.name}</span>,
      })
    }
  }

  const content = (
    <>
      {reorderable && (
        <span
          className={s.handle}
          onPointerDown={(e) => controls.start(e)}
          aria-hidden
        >
          <ReOrderDotsVertical16Regular />
        </span>
      )}
      <Checkbox
        checked={done}
        label={task.title}
        color={PRIORITY_COLOR[task.priority]}
        className={s.rowCheck}
        onChange={(checked) => void tasksRepo.setStatus(task.id, checked ? 'done' : 'open')}
      />
      <div className={s.rowBody}>
        <div className={s.rowTitle}>
          {task.priority > 0 && !done && (
            <FlagFilled className={s.flag} style={{ color: PRIORITY_COLOR[task.priority] }} />
          )}
          <span>{task.title}</span>
        </div>
        {(meta.length > 0 || progress) && (
          <div className={s.meta}>
            {progress && (
              <button
                type="button"
                className={s.subToggle}
                aria-expanded={expanded}
                aria-label={expanded ? t('tasks.hideSubtasks') : t('tasks.showSubtasks')}
                title={expanded ? t('tasks.hideSubtasks') : t('tasks.showSubtasks')}
                onClick={(e) => {
                  e.stopPropagation()
                  setFocusAdd(false)
                  setExpanded(task.id, !expanded)
                }}
              >
                <ChevronRightRegular className={s.subChevron} data-open={expanded} />
                <TaskListLtrRegular />
                {progress.done}/{progress.total}
              </button>
            )}
            {meta.map((m) => (
              <span key={m.key} className={s.metaItem} data-tone={m.tone}>
                {m.node}
              </span>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {expanded && canHaveSubtasks && (
            <InlineSubtasks
              key="subs"
              parent={task}
              subtasks={subtasks}
              onSelect={onSelect}
              autoFocusAdd={focusAdd}
              onCollapse={() => setExpanded(task.id, false)}
            />
          )}
        </AnimatePresence>
      </div>
      {canHaveSubtasks && !progress && !expanded && (
        <button
          type="button"
          className={s.rowAction}
          aria-label={t('tasks.addSubtask')}
          title={t('tasks.addSubtask')}
          onClick={(e) => {
            e.stopPropagation()
            setFocusAdd(true)
            setExpanded(task.id, true)
          }}
        >
          <Add16Regular />
        </button>
      )}
    </>
  )

  const common = {
    className: s.row,
    'data-selected': selected,
    'data-done': done,
    onClick: () => onSelect(task.id),
    onKeyDown: (e: KeyboardEvent) => e.key === 'Enter' && onSelect(task.id),
    tabIndex: 0,
    style: { '--row-tint': PRIORITY_COLOR[task.priority] } as CSSProperties,
  }

  if (reorderable) {
    return (
      <Reorder.Item
        value={task}
        dragListener={false}
        dragControls={controls}
        onDragEnd={onDragEnd}
        layout="position"
        transition={springFirm}
        whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-flyout)' }}
        {...common}
      >
        {content}
      </Reorder.Item>
    )
  }
  return <li {...common}>{content}</li>
}
