import { Delete16Regular, Open16Regular, Sparkle16Regular } from '@fluentui/react-icons'
import { useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  DomainError,
  timeBlocksRepo,
  timeEntriesRepo,
  type Task,
  type TimeBlock,
  type TimeBlockKind,
  type TimeEntry,
  type Timestamp,
} from '@/data'
import { projectList } from '@/features/tasks/lists'
import { listPath } from '@/features/tasks/paths'
import { TaskPicker } from '@/features/timer/TaskPicker'
import { TaskTimerButton } from '@/features/timer/TaskTimerButton'
import { formatMinutes } from '@/lib/format'
import { Button } from '@/ui/Button'
import { Popover } from '@/ui/Popover'
import { kindTint } from './colors'
import { MIN } from './geometry'
import type { CalendarLookup } from './zoom/useZoomData'
import s from './calendar.module.css'

const KINDS: Exclude<TimeBlockKind, 'task'>[] = ['event', 'break', 'routine']
const norm = (v: string) => v.toLowerCase().replace(/ё/g, 'е')

function useTimeRange() {
  const { t, i18n } = useTranslation()
  return (start: Timestamp, end: Timestamp) => {
    const fmt = (at: number) => new Date(at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
    const minutes = Math.round((end - start) / MIN)
    return `${fmt(start)} – ${fmt(end)} · ${formatMinutes(minutes, { h: t('common.h'), min: t('common.min') })}`
  }
}

interface DraftProps {
  anchor: DOMRect
  start: Timestamp
  end: Timestamp
  data: CalendarLookup
  onClose: () => void
}

/**
 * New block: type a title, or pick a task. The first option always creates a block with the
 * typed title; the rest are matching open tasks (today's plan first).
 */
export function DraftPopover({ anchor, start, end, data, onClose }: DraftProps) {
  const { t } = useTranslation()
  const range = useTimeRange()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<Exclude<TimeBlockKind, 'task'>>('event')
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const q = norm(text.trim())
    return data.tasks
      .filter((task) => task.status === 'open' && (!q || norm(task.title).includes(q)))
      .slice(0, 6)
  }, [data.tasks, text])

  const hasTitle = text.trim().length > 0
  // Option 0 is "create with this title" when there is text; tasks follow.
  const options = hasTitle ? matches.length + 1 : matches.length

  const create = async (taskId?: string) => {
    if (!taskId && !hasTitle) return
    try {
      await timeBlocksRepo.create(taskId ? { taskId, start, end } : { title: text, kind, start, end })
      onClose()
    } catch (e) {
      setError(t(`errors.${e instanceof DomainError ? e.code : 'unknown'}`))
    }
  }

  const choose = (index: number) => {
    if (hasTitle && index === 0) void create()
    else {
      const task = matches[hasTitle ? index - 1 : index]
      if (task) void create(task.id)
    }
  }

  return (
    <Popover anchor={anchor} onClose={onClose} label={t('calendar.newBlock')}>
      <div className={s.popHead}>
        <span className={s.popKicker}>{t('calendar.newBlock')}</span>
        <span className={s.popTime}>{range(start, end)}</span>
      </div>
      <input
        className={s.popInput}
        autoFocus
        value={text}
        placeholder={t('calendar.titlePlaceholder')}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(i + 1, options - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            choose(active)
          }
        }}
      />
      <ul className={s.popOptions} role="listbox">
        {hasTitle && (
          <li
            role="option"
            aria-selected={active === 0}
            className={s.popOption}
            onPointerEnter={() => setActive(0)}
            onClick={() => choose(0)}
          >
            <span className={s.popDot} style={{ background: kindTint(kind) }} />
            <span className={s.popOptionTitle}>
              {t('calendar.create')} «{text.trim()}»
            </span>
            <span className={s.popOptionMeta}>{t(`calendar.kinds.${kind}`)}</span>
          </li>
        )}
        {matches.map((task, i) => {
          const index = hasTitle ? i + 1 : i
          const project = data.projectOf(task)
          return (
            <li
              key={task.id}
              role="option"
              aria-selected={active === index}
              className={s.popOption}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className={s.popDot} style={{ background: project ? `var(--tint-${project.color})` : 'var(--tint-blue)' }} />
              <span className={s.popOptionTitle}>{task.title}</span>
              {project && <span className={s.popOptionMeta}>{project.name}</span>}
            </li>
          )
        })}
      </ul>
      {hasTitle && (
        <div className={s.kinds}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={s.kind}
              data-active={k === kind}
              style={{ '--kind': kindTint(k) } as CSSProperties}
              onClick={() => setKind(k)}
            >
              {t(`calendar.kinds.${k}`)}
            </button>
          ))}
        </div>
      )}
      {error && <p className={s.popError}>{error}</p>}
    </Popover>
  )
}

interface BlockProps {
  anchor: DOMRect
  block: TimeBlock
  data: CalendarLookup
  onClose: () => void
}

/** "Open task" jumps to the list that holds the task (its parent's, for a subtask). */
function OpenTaskButton({ task, data }: { task: Task; data: CalendarLookup }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <Button
      variant="subtle"
      icon={<Open16Regular />}
      onClick={() => {
        const owner = task.parentId ? data.taskById.get(task.parentId) ?? task : task
        navigate(listPath(owner.projectId ? projectList(owner.projectId) : 'inbox', task.id))
      }}
    >
      {t('calendar.openTask')}
    </Button>
  )
}

export function BlockPopover({ anchor, block, data, onClose }: BlockProps) {
  const { t } = useTranslation()
  const range = useTimeRange()
  const task = block.taskId ? data.taskById.get(block.taskId) : undefined
  const project = data.projectOf(task)

  return (
    <Popover anchor={anchor} onClose={onClose} label={data.blockTitle(block, t('calendar.noTask'))}>
      <div className={s.popHead}>
        <span className={s.popKicker} style={{ color: data.blockTint(block) }}>
          {task ? (project?.name ?? t('calendar.kinds.task')) : t(`calendar.kinds.${block.kind}`)}
        </span>
        <span className={s.popTime}>{range(block.start, block.end)}</span>
      </div>

      {task ? (
        <p className={s.popTitle}>{task.title}</p>
      ) : (
        <input
          className={s.popInput}
          defaultValue={block.title}
          aria-label={t('tasks.details.title')}
          onBlur={(e) => {
            const title = e.target.value.trim()
            if (title && title !== block.title) void timeBlocksRepo.update(block.id, { title })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}

      {!task && (
        <div className={s.kinds}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={s.kind}
              data-active={k === block.kind}
              style={{ '--kind': kindTint(k) } as CSSProperties}
              onClick={() => void timeBlocksRepo.update(block.id, { kind: k })}
            >
              {t(`calendar.kinds.${k}`)}
            </button>
          ))}
        </div>
      )}

      {block.origin === 'mentor' && (
        <p className={s.popNote}>
          <Sparkle16Regular /> {t('calendar.fromMentor')}
        </p>
      )}

      <div className={s.popActions}>
        {task && task.status === 'open' && <TaskTimerButton taskId={task.id} />}
        {task && <OpenTaskButton task={task} data={data} />}
        <Button
          variant="subtle"
          icon={<Delete16Regular />}
          className={s.popDelete}
          onClick={() => {
            onClose()
            void timeBlocksRepo.remove(block.id)
          }}
        >
          {t('calendar.delete')}
        </Button>
      </div>
    </Popover>
  )
}


interface EntryProps {
  anchor: DOMRect
  entry: TimeEntry
  data: CalendarLookup
  now: Timestamp
  onClose: () => void
}

/** A piece of the fact track: what was actually worked on, and when. */
export function EntryPopover({ anchor, entry, data, now, onClose }: EntryProps) {
  const { t } = useTranslation()
  const range = useTimeRange()
  const task = entry.taskId ? data.taskById.get(entry.taskId) : undefined
  const project = data.projectOf(task)
  const running = entry.end === null

  return (
    <Popover anchor={anchor} onClose={onClose} label={task?.title ?? t('calendar.noTask')}>
      <div className={s.popHead}>
        <span className={s.popKicker} style={{ color: project ? `var(--tint-${project.color})` : undefined }}>
          {t('calendar.fact')}
          {project && ` · ${project.name}`}
        </span>
        <span className={s.popTime}>
          {range(entry.start, entry.end ?? now)}
          {running && ` · ${t('calendar.running')}`}
        </span>
      </div>

      {task ? (
        <p className={s.popTitle}>{task.title}</p>
      ) : (
        <>
          <p className={s.popNote}>{t('calendar.entryNoTask')}</p>
          <TaskPicker value={undefined} onChange={(id) => id && void timeEntriesRepo.update(entry.id, { taskId: id })} />
        </>
      )}
      {entry.note && <p className={s.popNote}>{entry.note}</p>}

      <div className={s.popActions}>
        {task && task.status === 'open' && <TaskTimerButton taskId={task.id} />}
        {task && <OpenTaskButton task={task} data={data} />}
        {!running && (
          <Button
            variant="subtle"
            icon={<Delete16Regular />}
            className={s.popDelete}
            onClick={() => {
              onClose()
              void timeEntriesRepo.remove(entry.id)
            }}
          >
            {t('calendar.deleteEntry')}
          </Button>
        )}
      </div>
    </Popover>
  )
}
