import { AddRegular, ArrowRightRegular } from '@fluentui/react-icons'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAllTasks, useGoals, useNow, type Goal, type Task } from '@/data'
import { reviewDue } from '@/mentor/coach'
import { Button } from '@/ui/Button'
import m from '../mentor.module.css'
import { GoalInvite } from './GoalInvite'
import { setIntake, startIntake, useIntake } from './store'
import s from './intake.module.css'

/**
 * Learning goals on the mentor page: an invitation to start one when there are none, otherwise
 * a card per goal with its current stage and the next task. A paused intake can be resumed.
 */
export function GoalsSection() {
  const { t } = useTranslation()
  const goals = useGoals()
  const tasks = useAllTasks()
  const now = useNow(60_000)
  const paused = useIntake((st) => !st.active && st.messages.length > 0)
  const pausedTitle = useIntake((st) => st.profile.title ?? st.profile.subject)
  if (!goals) return null

  const current = goals.filter((g) => g.status === 'active' || g.status === 'paused')
  const resume = paused && (
    <div className={s.resume}>
      <span>
        {t('mentor.intake.resume')}
        {pausedTitle ? `: ${pausedTitle}` : ''}
      </span>
      <Button variant="accent" icon={<ArrowRightRegular />} onClick={() => setIntake({ active: true })}>
        {t('mentor.intake.continue')}
      </Button>
    </div>
  )

  if (current.length === 0) return (
    <>
      {resume}
      {!paused && <GoalInvite />}
    </>
  )

  return (
    <section className={s.goals} aria-label={t('mentor.goals.title')}>
      {resume}
      <div className={s.goalGrid}>
        {current.map((g) => (
          <GoalCard key={g.id} goal={g} tasks={tasks ?? []} now={now} />
        ))}
        {!paused && (
          <button
            type="button"
            className={s.newGoal}
            onClick={() => startIntake(t('mentor.intake.opening'))}
          >
            <AddRegular /> {t('mentor.goals.new')}
          </button>
        )}
      </div>
    </section>
  )
}

function GoalCard({ goal, tasks, now }: { goal: Goal; tasks: readonly Task[]; now: number }) {
  const { t } = useTranslation()
  const index = goal.stages.findIndex((st) => st.status === 'active')
  const stage = goal.stages[index]
  const next = tasks
    .filter((x) => x.goalId === goal.id && x.status === 'open' && (!stage || x.stageId === stage.id))
    .sort((a, b) => (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999'))[0]
  return (
    <Link to={`/mentor/goal/${goal.id}`} className={s.goalCard}>
      <h3 className={s.goalTitle}>{goal.title}</h3>
      {reviewDue(goal, now) && <span className={s.dueBadge}>{t('mentor.coach.reviewDueShort')}</span>}
      <div className={s.stageBar} aria-hidden>
        {goal.stages.map((st) => (
          <span key={st.id} data-status={st.status} />
        ))}
      </div>
      <p className={s.goalStage}>
        {stage
          ? t('mentor.goals.stage', { index: index + 1, total: goal.stages.length, title: stage.title })
          : t('mentor.goals.finished')}
      </p>
      <p className={m.hint}>
        {next ? t('mentor.goals.next', { title: next.title }) : t('mentor.goals.noNext')}
        {goal.weeklyMinutes
          ? ` · ${t('mentor.goals.weekly', { hours: Math.round(goal.weeklyMinutes / 6) / 10 })}`
          : ''}
      </p>
    </Link>
  )
}
