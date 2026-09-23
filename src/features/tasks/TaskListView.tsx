import {
  Archive16Regular,
  ChevronRight16Regular,
  Delete16Regular,
  MoreHorizontal20Regular,
  Rename16Regular,
} from '@fluentui/react-icons'
import { AnimatePresence, motion, Reorder } from 'motion/react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { projectsRepo, tasksRepo, type Task, type TintKey } from '@/data'
import { formatDay } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Menu } from '@/ui/Menu'
import { orderBetween, projectIdOf, selectList, type ListId } from './lists'
import { QuickAdd } from './QuickAdd'
import { TaskRow } from './TaskRow'
import type { TasksData } from './useTasksData'
import f from '@/ui/fields.module.css'
import s from './tasks.module.css'

const TINTS: TintKey[] = ['blue', 'green', 'violet', 'orange', 'rose', 'teal']

interface TaskListViewProps {
  list: ListId
  data: TasksData
  selectedId?: string
  onSelect: (id: string | undefined) => void
}

export function TaskListView({ list, data, selectedId, onSelect }: TaskListViewProps) {
  const { t, i18n } = useTranslation()
  const view = useMemo(() => selectList(data.tasks, list, data.today), [data.tasks, list, data.today])
  const [dragging, setDragging] = useState<Task[] | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const project = data.projectById.get(projectIdOf(list) ?? '')
  const title = project ? project.name : t(`tasks.lists.${list as 'inbox'}`)
  const reorderable = list !== 'upcoming'
  const open = dragging ?? view.open

  const persistOrder = async (moved: Task) => {
    const items = dragging ?? view.open
    const i = items.findIndex((x) => x.id === moved.id)
    const before = items[i - 1]?.order
    const after = items[i + 1]?.order
    const inPlace = (before === undefined || before < moved.order) && (after === undefined || moved.order < after)
    if (!inPlace) await tasksRepo.update(moved.id, { order: orderBetween(before, after) })
    setDragging(null)
  }

  const row = (task: Task, canDrag = false) => (
    <TaskRow
      key={task.id}
      task={task}
      list={list}
      data={data}
      selected={task.id === selectedId}
      onSelect={onSelect}
      reorderable={canDrag}
      onDragEnd={canDrag ? () => void persistOrder(task) : undefined}
    />
  )

  const empty = view.open.length === 0 && view.done.length === 0 && !data.loading

  return (
    <section className={s.listView}>
      <header className={s.listHeader}>
        <h1 className={s.listTitle}>
          {project && <span className={s.titleDot} style={{ background: `var(--tint-${project.color})` }} />}
          {renaming && project ? (
            <input
              className={f.inline}
              defaultValue={project.name}
              autoFocus
              aria-label={t('tasks.project.rename')}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => {
                setRenaming(false)
                if (e.target.value.trim() && e.target.value !== project.name) {
                  void projectsRepo.update(project.id, { name: e.target.value })
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(false)
              }}
            />
          ) : (
            <>
              {title}
              <span className={s.listCount}>{view.open.length || ''}</span>
            </>
          )}
        </h1>
        {project && (
          <ProjectMenu
            projectId={project.id}
            name={project.name}
            color={project.color}
            onRename={() => setRenaming(true)}
          />
        )}
      </header>

      {list === 'inbox' && <p className={s.listHint}>{t('tasks.inboxHint')}</p>}

      <QuickAdd list={list} data={data} onCreated={(id) => onSelect(id)} />

      {empty && <p className={s.emptyList}>{t(`tasks.empty.${project ? 'project' : (list as 'inbox')}`)}</p>}

      {view.groups ? (
        view.groups.map((g) => (
          <div key={g.day} className={s.group}>
            <h2 className={s.groupTitle}>{formatDay(g.day, data.today, i18n.language, t)}</h2>
            <ul className={s.rows}>{g.tasks.map((task) => row(task))}</ul>
          </div>
        ))
      ) : reorderable ? (
        <Reorder.Group
          as="ul"
          axis="y"
          values={open}
          onReorder={(items) => setDragging(items)}
          className={s.rows}
        >
          {open.map((task) => row(task, true))}
        </Reorder.Group>
      ) : null}

      {view.done.length > 0 && (
        <div className={s.doneSection}>
          <button
            type="button"
            className={s.doneToggle}
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            <ChevronRight16Regular className={s.chevron} data-open={showDone} />
            {t('tasks.done')}
            <span className={s.listCount}>{view.done.length}</span>
          </button>
          <AnimatePresence initial={false}>
            {showDone && (
              <motion.ul
                className={s.rows}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0, 0, 0, 1] }}
                style={{ overflow: 'hidden' }}
              >
                {view.done.map((task) => row(task))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  )
}

function ProjectMenu({
  projectId,
  name,
  color,
  onRename,
}: {
  projectId: string
  name: string
  color: TintKey
  onRename: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <>
      <Menu
        trigger={({ toggle }) => (
          <Button
            variant="subtle"
            iconOnly
            icon={<MoreHorizontal20Regular />}
            aria-label={t('tasks.project.menu')}
            onClick={toggle}
          />
        )}
        header={
          <div className={s.swatches}>
            {TINTS.map((tint) => (
              <button
                key={tint}
                type="button"
                className={s.swatch}
                data-active={tint === color}
                style={{ background: `var(--tint-${tint})` }}
                aria-label={tint}
                onClick={() => void projectsRepo.update(projectId, { color: tint })}
              />
            ))}
          </div>
        }
        items={[
          {
            label: t('tasks.project.rename'),
            icon: <Rename16Regular />,
            onSelect: onRename,
          },
          {
            label: t('tasks.project.archive'),
            icon: <Archive16Regular />,
            onSelect: () => {
              void projectsRepo.setArchived(projectId, true)
              navigate('/tasks/inbox')
            },
          },
          {
            label: t('tasks.project.delete'),
            icon: <Delete16Regular />,
            danger: true,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <Dialog
        open={confirmDelete}
        title={t('tasks.project.deleteTitle', { name })}
        primaryLabel={t('common.delete')}
        secondaryLabel={t('common.cancel')}
        danger
        onClose={() => setConfirmDelete(false)}
        onPrimary={() => {
          setConfirmDelete(false)
          void projectsRepo.remove(projectId).then(() => navigate('/tasks/inbox'))
        }}
      >
        {t('tasks.project.deleteText')}
      </Dialog>
    </>
  )
}
