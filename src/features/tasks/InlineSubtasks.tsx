import { Add16Regular } from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { tasksRepo, type Id, type Task } from '@/data'
import { formatMinutes } from '@/lib/format'
import { Checkbox } from '@/ui/Checkbox'
import s from './tasks.module.css'

interface InlineSubtasksProps {
  parent: Task
  subtasks: Task[]
  onSelect: (id: Id) => void
  /** Focus the "add" field on open — used by the row's quick "+" action. */
  autoFocusAdd?: boolean
  /** Called when the add field is left empty and there is nothing to show. */
  onCollapse: () => void
}

/**
 * Subtasks unfolded inside a task card: tick, open or add them without leaving the list.
 * Events stop here so clicks and keys never select or reorder the parent row.
 */
export function InlineSubtasks({
  parent,
  subtasks,
  onSelect,
  autoFocusAdd,
  onCollapse,
}: InlineSubtasksProps) {
  const { t } = useTranslation()
  const minutes = (m: number) => formatMinutes(m, { h: t('common.h'), min: t('common.min') })

  return (
    <motion.div
      className={s.inlineSubs}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0, 0, 0, 1] }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ul className={s.inlineList}>
        <AnimatePresence initial={false}>
          {subtasks.map((sub) => (
            <motion.li
              key={sub.id}
              layout="position"
              className={s.inlineItem}
              data-done={sub.status === 'done'}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <Checkbox
                checked={sub.status === 'done'}
                label={sub.title}
                round
                onChange={(checked) => void tasksRepo.setStatus(sub.id, checked ? 'done' : 'open')}
              />
              <button type="button" className={s.inlineTitle} onClick={() => onSelect(sub.id)}>
                {sub.title}
              </button>
              {sub.estimateMin && <span className={s.inlineMeta}>{minutes(sub.estimateMin)}</span>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <label className={s.inlineAdd}>
        <Add16Regular />
        <input
          autoFocus={autoFocusAdd}
          placeholder={t('tasks.addSubtask')}
          aria-label={t('tasks.addSubtask')}
          onKeyDown={(e) => {
            const input = e.currentTarget
            const title = input.value.trim()
            if (e.key === 'Enter' && title) {
              // Stay in the field so several subtasks can be typed in a row.
              void tasksRepo.create({ title, parentId: parent.id }).then(() => (input.value = ''))
            }
            if (e.key === 'Escape') input.blur()
          }}
          onBlur={(e) => {
            if (!e.currentTarget.value.trim() && subtasks.length === 0) onCollapse()
          }}
        />
      </label>
    </motion.div>
  )
}
