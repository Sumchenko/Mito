import { Add16Regular, Delete20Regular, Dismiss20Regular } from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addDays,
  DomainError,
  tagsRepo,
  tasksRepo,
  type Id,
  type LocalDate,
  type Priority,
  type Task,
} from '@/data'
import { duration, ease } from '@/design/motion'
import { formatMinutes } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Checkbox'
import { Dialog } from '@/ui/Dialog'
import f from '@/ui/fields.module.css'
import { Segmented } from '@/ui/Segmented'
import { findTag } from './createTask'
import { PRIORITY_COLOR } from './priority'
import type { TasksData } from './useTasksData'
import s from './tasks.module.css'

const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240]

interface TaskDetailsProps {
  task: Task
  data: TasksData
  onClose: () => void
  onSelect: (id: Id) => void
}

export function TaskDetails({ task, data, onClose, onSelect }: TaskDetailsProps) {
  const { t, i18n } = useTranslation()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const subtasks = data.tasks.filter((x) => x.parentId === task.id)
  const parent = task.parentId ? data.taskById.get(task.parentId) : undefined

  const save = (patch: Parameters<typeof tasksRepo.update>[1]) =>
    tasksRepo.update(task.id, patch).then(
      () => setError(null),
      (e: unknown) => setError(t(`errors.${e instanceof DomainError ? e.code : 'unknown'}`)),
    )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const minutes = (m: number) => formatMinutes(m, { h: t('common.h'), min: t('common.min') })
  const estimateOptions = [...new Set([...ESTIMATES, ...(task.estimateMin ? [task.estimateMin] : [])])].sort(
    (a, b) => a - b,
  )

  return (
    <motion.aside
      className={s.details}
      aria-label={task.title}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0, transition: { duration: duration.slower, ease: ease.out } }}
      exit={{ opacity: 0, x: 24, transition: { duration: duration.fast, ease: ease.in } }}
    >
      <div className={s.detailsHead}>
        <Checkbox
          checked={task.status === 'done'}
          label={task.title}
          color={PRIORITY_COLOR[task.priority]}
          onChange={(checked) => void tasksRepo.setStatus(task.id, checked ? 'done' : 'open')}
        />
        {/* Keyed by id so switching tasks resets the uncontrolled editor. */}
        <textarea
          key={task.id}
          className={`${f.inline} ${s.detailsTitle}`}
          defaultValue={task.title}
          rows={1}
          aria-label={t('tasks.details.title')}
          onInput={(e) => autoGrow(e.currentTarget)}
          ref={(el) => {
            if (el) autoGrow(el)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          onBlur={(e) => {
            const title = e.target.value.trim()
            if (!title) e.target.value = task.title
            else if (title !== task.title) void save({ title })
          }}
        />
        <Button variant="subtle" iconOnly icon={<Dismiss20Regular />} aria-label={t('tasks.details.close')} onClick={onClose} />
      </div>

      {parent && (
        <button type="button" className={s.parentLink} onClick={() => onSelect(parent.id)}>
          {t('tasks.subtaskOf', { title: parent.title })}
        </button>
      )}

      <div className={s.fields}>
        {!task.parentId && (
          <Field label={t('tasks.details.project')}>
            <select
              className={f.control}
              value={task.projectId ?? ''}
              onChange={(e) => void save({ projectId: e.target.value || null })}
            >
              <option value="">{t('tasks.details.noProject')}</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('tasks.details.planned')}>
          <DateField
            value={task.plannedDate}
            today={data.today}
            onChange={(plannedDate) => void save({ plannedDate })}
          />
        </Field>

        <Field label={t('tasks.details.due')}>
          <DateField value={task.dueDate} today={data.today} onChange={(dueDate) => void save({ dueDate })} />
        </Field>

        <Field label={t('tasks.details.estimate')}>
          <select
            className={f.control}
            value={task.estimateMin ?? ''}
            onChange={(e) => void save({ estimateMin: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t('tasks.details.noEstimate')}</option>
            {estimateOptions.map((m) => (
              <option key={m} value={m}>
                {minutes(m)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('tasks.details.priority')}>
          <Segmented<`${Priority}`>
            aria-label={t('tasks.details.priority')}
            value={String(task.priority) as `${Priority}`}
            options={(['0', '1', '2', '3'] as const).map((p) => ({ value: p, label: t(`tasks.priority.${p}`) }))}
            onChange={(p) => void save({ priority: Number(p) as Priority })}
          />
        </Field>

        <Field label={t('tasks.details.tags')}>
          <TagPicker task={task} data={data} onToggle={(tagIds) => void save({ tagIds })} />
        </Field>

        <Field label={t('tasks.details.notes')}>
          <textarea
            key={task.id}
            className={f.control}
            defaultValue={task.notes ?? ''}
            placeholder={t('tasks.details.notesPlaceholder')}
            onBlur={(e) => {
              const notes = e.target.value.trim()
              if (notes !== (task.notes ?? '')) void save({ notes: notes || null })
            }}
          />
        </Field>
      </div>

      {!task.parentId && (
        <div className={s.subtasks}>
          <h3 className={s.fieldLabel}>{t('tasks.details.subtasks')}</h3>
          <ul className={s.subList}>
            {subtasks.map((sub) => (
              <li key={sub.id} className={s.subItem} data-done={sub.status === 'done'}>
                <Checkbox
                  checked={sub.status === 'done'}
                  label={sub.title}
                  round
                  onChange={(checked) => void tasksRepo.setStatus(sub.id, checked ? 'done' : 'open')}
                />
                <button type="button" className={s.subTitle} onClick={() => onSelect(sub.id)}>
                  {sub.title}
                </button>
                {sub.estimateMin && <span className={s.subMeta}>{minutes(sub.estimateMin)}</span>}
              </li>
            ))}
          </ul>
          <label className={s.subAdd}>
            <Add16Regular />
            <input
              placeholder={t('tasks.details.addSubtask')}
              onKeyDown={(e) => {
                const title = e.currentTarget.value.trim()
                if (e.key === 'Enter' && title) {
                  const input = e.currentTarget
                  void tasksRepo.create({ title, parentId: task.id }).then(() => (input.value = ''))
                }
              }}
            />
          </label>
        </div>
      )}

      {error && <p className={s.error}>{error}</p>}

      <footer className={s.detailsFoot}>
        <span>
          {t('tasks.details.created', {
            date: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(task.createdAt),
          })}
        </span>
        <Button
          variant="subtle"
          icon={<Delete20Regular />}
          className={s.deleteButton}
          onClick={() => setConfirmDelete(true)}
        >
          {t('tasks.details.delete')}
        </Button>
      </footer>

      <Dialog
        open={confirmDelete}
        title={t('tasks.details.deleteTitle')}
        primaryLabel={t('common.delete')}
        secondaryLabel={t('common.cancel')}
        danger
        onClose={() => setConfirmDelete(false)}
        onPrimary={() => {
          setConfirmDelete(false)
          onClose()
          void tasksRepo.remove(task.id)
        }}
      >
        {t('tasks.details.deleteText')}
      </Dialog>
    </motion.aside>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
    </div>
  )
}

/** Native date input plus one-click shortcuts; `null` clears the date. */
function DateField({
  value,
  today,
  onChange,
}: {
  value?: LocalDate
  today: LocalDate
  onChange: (value: LocalDate | null) => void
}) {
  const { t } = useTranslation()
  const shortcuts: [string, LocalDate][] = [
    [t('common.today'), today],
    [t('common.tomorrow'), addDays(today, 1)],
  ]
  return (
    <div className={s.dateField}>
      <input
        type="date"
        className={f.control}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value as LocalDate) || null)}
      />
      {shortcuts.map(([label, day]) => (
        <button
          key={label}
          type="button"
          className={s.pill}
          data-active={value === day}
          onClick={() => onChange(day)}
        >
          {label}
        </button>
      ))}
      {value && (
        <button type="button" className={s.pill} onClick={() => onChange(null)} aria-label={t('tasks.details.clear')}>
          ×
        </button>
      )}
    </div>
  )
}

function TagPicker({ task, data, onToggle }: { task: Task; data: TasksData; onToggle: (tagIds: Id[]) => void }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const toggle = (id: Id) =>
    onToggle(task.tagIds.includes(id) ? task.tagIds.filter((x) => x !== id) : [...task.tagIds, id])

  const addTag = async (name: string) => {
    setAdding(false)
    if (!name.trim()) return
    const tag = findTag(data.tags, name) ?? (await tagsRepo.create({ name }))
    if (!task.tagIds.includes(tag.id)) onToggle([...task.tagIds, tag.id])
  }

  return (
    <div className={s.tagPicker}>
      {data.tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          className={s.pill}
          data-active={task.tagIds.includes(tag.id)}
          style={{ '--pill-tint': `var(--tint-${tag.color})` } as CSSProperties}
          onClick={() => toggle(tag.id)}
        >
          @{tag.name}
        </button>
      ))}
      {adding ? (
        <input
          className={`${f.control} ${s.tagInput}`}
          autoFocus
          onBlur={(e) => void addTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setAdding(false)
          }}
        />
      ) : (
        <button type="button" className={s.pill} onClick={() => setAdding(true)}>
          {t('tasks.details.newTag')}
        </button>
      )}
    </div>
  )
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
