import {
  CheckmarkCircle20Regular,
  DataTrending20Regular,
  Send20Filled,
  Sparkle20Filled,
  Target20Regular,
  Timer20Regular,
} from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { tasksRepo, type Project, type Task, type TimeBlock } from '@/data'
import { pageTransition, springFirm } from '@/design/motion'
import { listPath } from '@/features/tasks/paths'
import { PRIORITY_COLOR } from '@/features/tasks/priority'
import { TaskTimerButton } from '@/features/timer/TaskTimerButton'
import { Checkbox } from '@/ui/Checkbox'
import { daypartOf, Landscape } from '@/ui/Landscape'
import { StatTile } from '@/ui/StatTile'
import s from './TodayPage.module.css'
import { useToday } from './useToday'

function greetingKey(hour: number) {
  if (hour < 5) return 'today.greetingNight' as const
  if (hour < 12) return 'today.greetingMorning' as const
  if (hour < 18) return 'today.greetingDay' as const
  return 'today.greetingEvening' as const
}

const tint = (project?: Project) => `var(--tint-${project?.color ?? 'blue'})`

export function TodayPage() {
  const { t, i18n } = useTranslation()
  const today = useToday()
  const now = new Date(today.now)
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  const trackedMin = Math.floor(today.trackedMs / 60_000)
  const total = today.focusTasks.length

  return (
    <motion.div className={s.page} {...pageTransition}>
      <div className={s.main}>
        <header className={s.hero}>
          <Landscape daypart={daypartOf(now.getHours())} className={s.scene} />
          <div className={s.heroText}>
            <p className={s.date}>{date}</p>
            <h1 className={s.greeting}>{t(greetingKey(now.getHours()))}</h1>
            <p className={s.heroLine}>{t('today.heroLine')}</p>
          </div>
        </header>

        <div className={s.tiles}>
          <StatTile
            icon={<Timer20Regular />}
            tint="var(--tint-blue)"
            label={t('today.tiles.focusTime')}
            value={
              <>
                {Math.floor(trackedMin / 60)}
                <small>{t('today.hours')}</small>
                {String(trackedMin % 60).padStart(2, '0')}
                <small>{t('today.minutes')}</small>
              </>
            }
            hint={t('today.tiles.focusTimeHint')}
          />
          <StatTile
            icon={<CheckmarkCircle20Regular />}
            tint="var(--tint-green)"
            label={t('today.tiles.tasksDone')}
            value={`${today.doneCount} / ${total}`}
            progress={total ? today.doneCount / total : 0}
          />
          <StatTile
            icon={<Target20Regular />}
            tint="var(--tint-violet)"
            label={t('today.tiles.sessions')}
            value={today.sessions}
            hint={t('today.tiles.sessionsHint')}
          />
          <StatTile
            icon={<DataTrending20Regular />}
            tint="var(--tint-orange)"
            label={t('today.tiles.plan')}
            value={`${Math.round(today.planRatio * 100)}%`}
            hint={t('today.tiles.planHint')}
          />
        </div>

        <div className={s.columns}>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t('today.focus')}</h2>
            {total === 0 && !today.loading ? (
              <p className={s.empty}>{t('today.focusEmpty')}</p>
            ) : (
              <ul className={s.taskList}>
                <AnimatePresence initial={false}>
                  {today.focusTasks.map((task) => (
                    <FocusTask
                      key={task.id}
                      task={task}
                      project={task.projectId ? today.projectById.get(task.projectId) : undefined}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section className={s.card}>
            <h2 className={s.cardTitle}>{t('today.plan')}</h2>
            <DayTimeline
              now={today.now}
              dayStart={today.dayStart}
              blocks={today.blocks}
              label={(b) => {
                const task = b.taskId ? today.taskById.get(b.taskId) : undefined
                return task?.title ?? b.title ?? t('today.tiles.noTask')
              }}
              color={(b) => {
                if (b.kind === 'break') return 'var(--text-tertiary)'
                if (b.kind === 'routine') return 'var(--tint-teal)'
                if (b.kind === 'event') return 'var(--tint-rose)'
                const task = b.taskId ? today.taskById.get(b.taskId) : undefined
                return tint(task?.projectId ? today.projectById.get(task.projectId) : undefined)
              }}
            />
            {today.blocks.length === 0 && <p className={s.empty}>{t('today.planEmpty')}</p>}
          </section>
        </div>
      </div>

      <MentorPanel />
    </motion.div>
  )
}

function FocusTask({ task, project }: { task: Task; project?: Project }) {
  const { t } = useTranslation()
  const done = task.status === 'done'
  return (
    <motion.li
      layout
      className={s.task}
      data-done={done}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={springFirm}
    >
      <Checkbox
        checked={done}
        label={task.title}
        color={PRIORITY_COLOR[task.priority]}
        onChange={(checked) => void tasksRepo.setStatus(task.id, checked ? 'done' : 'open')}
      />
      <span className={s.dot} style={{ background: tint(project) }} />
      <span className={s.taskText}>
        <Link to={listPath('today', task.id)} className={s.taskTitle}>
          {task.title}
        </Link>
        {project && <span className={s.taskProject}>{project.name}</span>}
      </span>
      {task.estimateMin && (
        <span className={s.estimate}>
          {task.estimateMin >= 60 && (
            <>
              {Math.floor(task.estimateMin / 60)}
              {t('today.hours')}{' '}
            </>
          )}
          {task.estimateMin % 60 > 0 && (
            <>
              {task.estimateMin % 60}
              {t('today.minutes')}
            </>
          )}
        </span>
      )}
      {!done && <TaskTimerButton taskId={task.id} className={s.play} />}
    </motion.li>
  )
}

const START_HOUR = 8
const END_HOUR = 22
const HOUR_MS = 3_600_000

interface DayTimelineProps {
  now: number
  dayStart: number
  blocks: TimeBlock[]
  label: (b: TimeBlock) => string
  color: (b: TimeBlock) => string
}

/** Vertical hour grid with plan blocks and a "now" line — the seed of the calendar day view. */
function DayTimeline({ now, dayStart, blocks, label, color }: DayTimelineProps) {
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
  const from = dayStart + START_HOUR * HOUR_MS
  const span = (END_HOUR - START_HOUR) * HOUR_MS
  const pos = (at: number) => Math.min(Math.max((at - from) / span, 0), 1) * 100
  const nowInRange = now >= from && now <= from + span
  const fmt = (at: number) =>
    new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={s.timeline}>
      {hours.map((h) => (
        <div key={h} className={s.hourRow} aria-hidden>
          <span className="tabular">{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}
      <div className={s.blocks}>
        {blocks.map((b) => {
          const top = pos(b.start)
          const height = pos(b.end) - top
          if (height <= 0) return null
          return (
            <div
              key={b.id}
              className={s.block}
              data-kind={b.kind}
              data-past={b.end < now}
              style={{ top: `${top}%`, height: `${height}%`, '--block': color(b) } as CSSProperties}
              title={`${label(b)} · ${fmt(b.start)}–${fmt(b.end)}`}
            >
              <span className={s.blockTitle}>{label(b)}</span>
              <span className={s.blockTime}>
                {fmt(b.start)}–{fmt(b.end)}
              </span>
            </div>
          )
        })}
        {nowInRange && <div className={s.now} style={{ top: `${pos(now)}%` }} />}
      </div>
    </div>
  )
}

function MentorPanel() {
  const { t } = useTranslation()
  const chips = [t('today.mentor.chipPlan'), t('today.mentor.chipFocus'), t('today.mentor.chipReview')]
  return (
    <aside className={s.mentor}>
      <div className={s.mentorHead}>
        <span className={s.mentorIcon}>
          <Sparkle20Filled />
        </span>
        <h2 className={s.cardTitle}>{t('today.mentor.title')}</h2>
        <span className={s.badge}>{t('today.mentor.status')}</span>
      </div>
      <p className={s.mentorIntro}>{t('today.mentor.intro')}</p>
      <div className={s.mentorFooter}>
        <label className={s.input}>
          <input placeholder={t('today.mentor.placeholder')} disabled />
          <Send20Filled className={s.send} />
        </label>
        <div className={s.chips}>
          {chips.map((c) => (
            <button key={c} type="button" className={s.chip} disabled>
              {c}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
