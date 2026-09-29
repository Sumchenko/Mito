import {
  addDays,
  goalsRepo,
  startOfLocalDate,
  mentorNotesRepo,
  tasksRepo,
  type Goal,
  type GoalProfile,
  type LocalDate,
} from '@/data'
import type { IntakeProfile, RoadmapResponse } from './protocol'

const ESSENTIAL = ['subject', 'level', 'success', 'weeklyMinutes'] as const

/** How much of the essential picture the intake has: drives the "what I understood" card. */
export function intakeProgress(profile: IntakeProfile) {
  const known = ESSENTIAL.filter((k) => profile[k] !== undefined).length
  return { known, total: ESSENTIAL.length }
}

/** The day itself when the user studies on it, otherwise the next day they do. */
export function onStudyDay(date: LocalDate, days?: readonly number[]): LocalDate {
  if (!days?.length) return date
  for (let i = 0; i < 7; i++) {
    const day = addDays(date, i)
    if (days.includes((new Date(startOfLocalDate(day)).getDay() + 6) % 7)) return day
  }
  return date
}

/** The stored profile of a goal: the intake's text fields, without the plan's numbers. */
export function toGoalProfile(p: IntakeProfile): GoalProfile {
  const keys = ['level', 'background', 'motivation', 'success', 'schedule', 'style', 'constraints'] as const
  const out: GoalProfile = { subject: p.subject ?? p.title ?? '' }
  for (const k of keys) if (p[k]) out[k] = p[k]
  return out
}

/**
 * Starts a goal from an accepted learning plan: the goal with its project, the picked first
 * tasks tied to their stages, and the mentor's first notes about the user. A planned day in the
 * past (a model slip) is dropped rather than creating an overdue task on day one.
 */
export async function startGoal(
  roadmap: RoadmapResponse,
  profile: IntakeProfile,
  picked: readonly boolean[],
  today: LocalDate,
): Promise<Goal> {
  const goal = await goalsRepo.create({
    title: roadmap.title || profile.title || profile.subject || '—',
    profile: toGoalProfile(profile),
    stages: roadmap.stages,
    ...(profile.targetDate ? { targetDate: profile.targetDate as LocalDate } : {}),
    ...(profile.weeklyMinutes ? { weeklyMinutes: profile.weeklyMinutes } : {}),
    ...(profile.studyDays?.length ? { studyDays: profile.studyDays } : {}),
  })
  for (const [i, task] of roadmap.tasks.entries()) {
    if (!picked[i]) continue
    await tasksRepo.create({
      title: task.title,
      projectId: goal.projectId,
      goalId: goal.id,
      stageId: task.stageId,
      ...(task.notes ? { notes: task.notes } : {}),
      ...(task.estimateMin ? { estimateMin: task.estimateMin } : {}),
      ...(task.plannedDate && task.plannedDate >= today
        ? { plannedDate: onStudyDay(task.plannedDate as LocalDate, profile.studyDays) }
        : {}),
    })
  }
  for (const text of roadmap.notes) {
    await mentorNotesRepo.add({ text: text.slice(0, 300), source: 'mentor', goalId: goal.id })
  }
  return goal
}
