import { AnimatePresence, motion } from 'motion/react'
import { useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { pageTransition } from '@/design/motion'
import { ListsPane } from './ListsPane'
import { listFromParams } from './paths'
import { TaskDetails } from './TaskDetails'
import { TaskListView } from './TaskListView'
import { useTasksData } from './useTasksData'
import s from './tasks.module.css'

/** Three panes: lists · tasks · details of the selected task (`?task=<id>`). */
export function TasksPage() {
  const params = useParams()
  const [search, setSearch] = useSearchParams()
  const list = listFromParams(params.list, params.projectId)
  const data = useTasksData()

  const selectedId = search.get('task') ?? undefined
  const selected = selectedId ? data.taskById.get(selectedId) : undefined

  const select = useCallback(
    (id: string | undefined) =>
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) next.set('task', id)
          else next.delete('task')
          return next
        },
        { replace: true },
      ),
    [setSearch],
  )
  const close = useCallback(() => select(undefined), [select])

  return (
    <motion.div className={s.page} data-details={!!selected} {...pageTransition}>
      <ListsPane data={data} />
      <TaskListView key={list} list={list} data={data} selectedId={selectedId} onSelect={select} />
      <AnimatePresence>
        {selected && (
          <TaskDetails key="details" task={selected} data={data} onClose={close} onSelect={select} />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
