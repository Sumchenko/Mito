import {
  ArrowLeftRegular,
  CheckmarkRegular,
  DeleteRegular,
  DismissRegular,
  FlagRegular,
  MoreHorizontalRegular,
  PauseRegular,
  PlayRegular,
} from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useState, type CSSProperties } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import {
  goalsRepo,
  mentorNotesRepo,
  NOTE_MAX_LENGTH,
  tasksRepo,
  toLocalDate,
  useAllTasks,
  useMentorNotes,
  useNow,
  useProjects,
  useTaskEntries,
  type Goal,
  type Task,
} from '@/data'
import { pageTransition } from '@/design/motion'
import { formatDay, formatMinutes } from '@/lib/format'
import { goalProgress, type StageProgress } from '@/mentor/goalProgress'
import { Button } from '@/ui/Button'
import { BarChart } from '@/ui/charts/BarChart'
import { Checkbox } from '@/ui/Checkbox'
import { Dialog } from '@/ui/Dialog'
import { Menu } from '@/ui/Menu'
import f from '@/ui/fields.module.css'
import s from './GoalPage.module.css'

const MIN = 60_000

/**
 * One learning goal: the way from stage to stage with the tasks of the current one, the time
 * put in against the weekly plan, and what the mentor knows and remembers about the user.
 */
export function GoalPage() {
  const { t } = useTranslation()
  const { goalId } = useParams()
  // null: no such goal (deleted, or never synced here); undefined: still loading.
  const goal = useLiveQuery(
    () => (goalId ? goalsRepo.get(goalId).then((g) => g ?? null) : null),
    [goalId],
  )

  if (goal === undefined) return null
  if (goal === null) {
    return (
      <motion.div className={s.page} {...pageTransition}>
        <Back />
        <p className={s.muted}>{t('mentor.goal.notFound')}</p>
      </motion.div>
    )
  }
  return <GoalView goal={goal} />
}

function Back() {
  const { t } = useTranslation()
  return (
    <Link to="/mentor" className={s.back}>
      <ArrowLeftRegular /> {t('mentor.goal.back')}
    </Link>
  )
}

function GoalView({ goal }: { goal: Goal }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const now = useNow(60_000)
  const today = toLocalDate(now)
  const tasks = useAllTasks()
  const projects = useProjects(true)
  const own = (tasks ?? []).filter((x) => x.goalId === goal.id)
  const entries = useTaskEntries(own.map((x) => x.id))
  const [removing, setRemoving] = useState(false)

  const progress = goalProgress(goal, tasks ?? [], entries ?? [], now)
  const tint = `var(--tint-${projects?.find((p) => p.id === goal.projectId)?.color ?? 'blue'})`
  const minutes = (m: number) => formatMinutes(m, { h: t('common.h'), min: t('common.min') })
  const day = (d: string) => formatDay(d as never, today, i18n.language, t)
  const since = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(goal.createdAt)
  const active = goal.status === 'active' || goal.status === 'paused'

  return (
    <motion.div className={s.page} {...pageTransition} style={{ '--goal': tint } as CSSProperties}>
      <Back />
      <header className={s.header}>
        <div className={s.heading}>
          <h1 className={s.title}>{goal.title}</h1>
          <p className={s.meta}>
            <span className={s.status} data-status={goal.status}>
              {t(`mentor.goal.status.${goal.status}`)}
            </span>
            <span>{t('mentor.goal.since', { date: since })}</span>
            {goal.targetDate && (
              <span>
                {t('mentor.goal.until', { date: day(goal.targetDate) })}
                {progress.daysLeft !== undefined &&
                  ` · ${progress.daysLeft >= 0 ? t('mentor.goal.daysLeft', { count: progress.daysLeft }) : t('mentor.goal.overdue')}`}
              </span>
            )}
          </p>
        </div>
        <div className={s.actions}>
          {active && (
            <Button
              icon={goal.status === 'paused' ? <PlayRegular /> : <PauseRegular />}
              onClick={() => void goalsRepo.setStatus(goal.id, goal.status === 'paused' ? 'active' : 'paused')}
            >
              {goal.status === 'paused' ? t('mentor.goal.resume') : t('mentor.goal.pause')}
            </Button>
          )}
          <Menu
            trigger={({ toggle }) => (
              <Button variant="subtle" iconOnly icon={<MoreHorizontalRegular />} aria-label={t('mentor.goal.more')} onClick={toggle} />
            )}
            items={[
              ...(active
                ? [{ label: t('mentor.goal.finish'), icon: <FlagRegular />, onSelect: () => void goalsRepo.setStatus(goal.id, 'done') }]
                : []),
              { label: t('mentor.goal.remove'), icon: <DeleteRegular />, danger: true, onSelect: () => setRemoving(true) },
            ]}
          />
        </div>
      </header>

      <div className={s.layout}>
        <section className={s.path} aria-labelledby="goal-path">
          <h2 id="goal-path" className={s.sectionTitle}>
            {t('mentor.goal.path')}
          </h2>
          <ol className={s.stages}>
            {progress.stages.map((stage, i) => (
              <Stage
                key={stage.id}
                stage={stage}
                index={i}
                goal={goal}
                today={today}
                minutes={minutes}
                day={day}
              />
            ))}
          </ol>
        </section>

        <aside className={s.side}>
          <Pace goal={goal} progress={progress} minutes={minutes} lang={i18n.language} />
          <Profile goal={goal} />
          <Notes goal={goal} />
        </aside>
      </div>

      <Dialog
        open={removing}
        title={t('mentor.goal.removeTitle')}
        primaryLabel={t('mentor.goal.remove')}
        secondaryLabel={t('mentor.goal.cancel')}
        danger
        onClose={() => setRemoving(false)}
        onPrimary={() => {
          setRemoving(false)
          void goalsRepo.remove(goal.id).then(() => navigate('/mentor'))
        }}
      >
        {t('mentor.goal.removeText')}
      </Dialog>
    </motion.div>
  )
}

/** A stop on the way: done ones fold to a line, the current one opens with its tasks. */
function Stage({
  stage,
  index,
  goal,
  today,
  minutes,
  day,
}: {
  stage: StageProgress
  index: number
  goal: Goal
  today: string
  minutes: (m: number) => string
  day: (d: string) => string
}) {
  const { t } = useTranslation()
  const [showDone, setShowDone] = useState(false)
  const now = stage.status === 'active'
  const open = stage.tasks.filter((x) => x.status === 'open')
  const closed = stage.tasks.filter((x) => x.status !== 'open')
  const finished = stage.total > 0 && open.length === 0
  return (
    <li className={s.stage} data-status={stage.status}>
      <span className={s.marker} aria-hidden>
        {stage.status === 'done' ? <CheckmarkRegular /> : index + 1}
      </span>
      <div className={s.stageBody}>
        <div className={s.stageHead}>
          <h3 className={s.stageTitle}>{stage.title}</h3>
          {stage.status !== 'upcoming' && (
            <span className={s.stageTag}>
              {stage.status === 'done' ? t('mentor.goal.stageDone') : t('mentor.goal.stageNow')}
            </span>
          )}
        </div>
        <p className={s.outcome}>{stage.outcome}</p>
        {stage.total > 0 && (
          <p className={s.count}>
            {t('mentor.goal.stageCount', { done: stage.done, total: stage.total })}
            {stage.weeks ? ` · ${t('mentor.roadmap.weeks', { count: stage.weeks })}` : ''}
          </p>
        )}

        {now && (
          <>
            {stage.tasks.length === 0 ? (
              <p className={s.muted}>{t('mentor.goal.noTasks')}</p>
            ) : (
              <ul className={s.tasks}>
                {[...open, ...(showDone ? closed : [])].map((task) => (
                  <TaskRow key={task.id} task={task} today={today} minutes={minutes} day={day} />
                ))}
              </ul>
            )}
            <div className={s.stageActions}>
              {goal.status === 'active' && (
                <Button
                  variant={finished ? 'accent' : 'standard'}
                  icon={<CheckmarkRegular />}
                  onClick={() => void goalsRepo.completeStage(goal.id, stage.id)}
                >
                  {t('mentor.goal.complete')}
                </Button>
              )}
              {closed.length > 0 && (
                <Button variant="subtle" onClick={() => setShowDone(!showDone)}>
                  {showDone
                    ? t('mentor.goal.hideDone')
                    : t('mentor.goal.showDone', { count: closed.length })}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  )
}

function TaskRow({
  task,
  today,
  minutes,
  day,
}: {
  task: Task
  today: string
  minutes: (m: number) => string
  day: (d: string) => string
}) {
  const done = task.status === 'done'
  const late = !done && task.plannedDate !== undefined && task.plannedDate < today
  return (
    <li className={s.task} data-done={done}>
      <Checkbox
        round
        checked={done}
        label={task.title}
        color="var(--goal)"
        onChange={(checked) => void tasksRepo.setStatus(task.id, checked ? 'done' : 'open')}
      />
      <span className={s.taskText}>
        <span className={s.taskTitle}>{task.title}</span>
        {task.notes && !done && <span className={s.taskNotes}>{task.notes}</span>}
      </span>
      <span className={s.taskMeta} data-late={late}>
        {[task.plannedDate && day(task.plannedDate), task.estimateMin && minutes(task.estimateMin)]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </li>
  )
}

/** Time put in, week by week, against the weekly plan agreed in the intake. */
function Pace({
  goal,
  progress,
  minutes,
  lang,
}: {
  goal: Goal
  progress: ReturnType<typeof goalProgress>
  minutes: (m: number) => string
  lang: string
}) {
  const { t } = useTranslation()
  const plan = goal.weeklyMinutes
  const share = plan ? Math.min(1, progress.weekMinutes / plan) : 0
  const label = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
  return (
    <section className={s.card}>
      <h2 className={s.sectionTitle}>{t('mentor.goal.week')}</h2>
      <p className={s.week}>
        <b>{minutes(progress.weekMinutes)}</b>
        {plan && <span>{t('mentor.goal.weekPlan', { plan: minutes(plan) })}</span>}
      </p>
      {plan && (
        <div className={s.meter} role="meter" aria-valuenow={progress.weekMinutes} aria-valuemax={plan}>
          <span style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <BarChart
        height={150}
        ariaLabel={t('mentor.goal.weeksChart')}
        formatTick={(v) => minutes(Math.round(v / MIN))}
        activeKey={progress.weeks.at(-1)?.start}
        {...(plan ? { average: { value: plan * MIN, label: t('mentor.goal.plan') } } : {})}
        data={progress.weeks.map((w) => ({
          key: w.start,
          label: label.format(new Date(`${w.start}T12:00`)),
          segments: [{ key: 'goal', tint: 'var(--goal)', value: w.minutes * MIN }],
        }))}
      />
      <p className={s.muted}>{t('mentor.goal.total', { value: minutes(progress.totalMinutes) })}</p>
    </section>
  )
}

const PROFILE = ['level', 'success', 'motivation', 'background', 'schedule', 'style', 'constraints'] as const

function Profile({ goal }: { goal: Goal }) {
  const { t } = useTranslation()
  const rows = PROFILE.filter((k) => goal.profile[k])
  if (rows.length === 0) return null
  return (
    <section className={s.card}>
      <h2 className={s.sectionTitle}>{t('mentor.goal.profile')}</h2>
      <dl className={s.facts}>
        {rows.map((k) => (
          <div key={k}>
            <dt>{t(`mentor.intake.fields.${k}`)}</dt>
            <dd>{goal.profile[k]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The mentor's memory, in the open: the user can see, remove and add what it keeps. */
function Notes({ goal }: { goal: Goal }) {
  const { t } = useTranslation()
  const notes = useMentorNotes(goal.id)
  const [text, setText] = useState('')
  const add = () => {
    const value = text.trim()
    if (!value) return
    setText('')
    void mentorNotesRepo.add({ text: value, source: 'user', goalId: goal.id })
  }
  return (
    <section className={s.card}>
      <h2 className={s.sectionTitle}>{t('mentor.goal.notes')}</h2>
      <p className={s.muted}>{t('mentor.goal.notesHint')}</p>
      {notes && notes.length > 0 && (
        <ul className={s.notes}>
          {notes.map((n) => (
            <li key={n.id} data-source={n.source}>
              <span>{n.text}</span>
              <button
                type="button"
                className={s.noteRemove}
                aria-label={t('mentor.goal.removeNote')}
                title={t('mentor.goal.removeNote')}
                onClick={() => void mentorNotesRepo.remove(n.id)}
              >
                <DismissRegular />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={s.noteForm}
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <input
          className={f.control}
          value={text}
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t('mentor.goal.notePlaceholder')}
          aria-label={t('mentor.goal.notePlaceholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={!text.trim()}>
          {t('mentor.goal.addNote')}
        </Button>
      </form>
    </section>
  )
}
