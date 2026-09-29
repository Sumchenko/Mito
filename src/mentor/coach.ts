import {
  goalsRepo,
  mentorNotesRepo,
  tasksRepo,
  toLocalDate,
  type Goal,
  type Id,
  type LocalDate,
  type MentorNote,
  type Task,
  type TimeEntry,
  type Timestamp,
} from '@/data'
import { goalProgress } from './goalProgress'
import { onStudyDay } from './goals'
import type { CoachKind, CoachProposal, GoalContext, GoalSignal } from './protocol'

const MIN = 60_000
const DAY = 86_400_000
/** Done tasks of earlier stages the mentor sees: enough for context, not a transcript. */
const KEEP_DONE = 12

/** A week after the start or the last meeting, an active goal is due for the next one. */
export function reviewDue(goal: Goal, now: Timestamp) {
  return goal.status === 'active' && now - (goal.lastReviewAt ?? goal.createdAt) >= 7 * DAY
}

/**
 * The goal as the mentor sees it in a session: stages, its tasks by short refs (open ones all,
 * done ones of the current stage and the latest others), weeks of time put in, the notes.
 */
export function buildGoalContext(
  goal: Goal,
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  notes: readonly MentorNote[],
  now: Timestamp,
): { context: GoalContext; refs: Map<string, Id> } {
  const progress = goalProgress(goal, tasks, entries, now, 4)
  const active = goal.stages.find((s) => s.status === 'active')?.id
  const own = tasks.filter((t) => t.goalId === goal.id && !t.deletedAt && t.status !== 'cancelled')
  const tracked = new Map<Id, number>()
  for (const e of entries) {
    if (e.deletedAt || !e.taskId) continue
    tracked.set(e.taskId, (tracked.get(e.taskId) ?? 0) + ((e.end ?? now) - e.start))
  }
  const olderDone = own
    .filter((t) => t.status === 'done' && t.stageId !== active)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, KEEP_DONE)
  const shown = [...own.filter((t) => t.status === 'open' || t.stageId === active), ...olderDone]
  const refs = new Map<string, Id>()
  const byId = new Map(own.map((t) => [t.id, t]))
  const context: GoalContext = {
    title: goal.title,
    profile: { ...goal.profile, ...(goal.studyDays?.length ? { studyDays: goal.studyDays } : {}) },
    ...(goal.weeklyMinutes ? { weeklyMinutes: goal.weeklyMinutes } : {}),
    ...(goal.targetDate ? { targetDate: goal.targetDate } : {}),
    stages: goal.stages.map((s) => ({
      id: s.id,
      title: s.title,
      outcome: s.outcome,
      ...(s.weeks ? { weeks: s.weeks } : {}),
      status: s.status,
      ...(s.checks?.length
        ? { checks: s.checks.map(({ score, passed, gaps }) => ({ score, passed, gaps })) }
        : {}),
    })),
    tasks: shown.map((t, i) => {
      const ref = `t${i + 1}`
      refs.set(ref, t.id)
      return {
        ref,
        title: t.title,
        stageId: t.stageId ?? goal.stages[0]?.id ?? '',
        status: t.status === 'done' ? ('done' as const) : ('open' as const),
        ...(t.plannedDate ? { plannedDate: t.plannedDate } : {}),
        ...(t.estimateMin ? { estimateMin: t.estimateMin } : {}),
        trackedMin: Math.round((tracked.get(t.id) ?? 0) / MIN),
        ...(t.notes ? { notes: t.notes.slice(0, 300) } : {}),
        ...(t.parentId && byId.get(t.parentId) ? { parent: byId.get(t.parentId)!.title } : {}),
      }
    }),
    weeks: progress.weeks,
    ...(goal.lastReviewAt ? { lastReview: toLocalDate(goal.lastReviewAt) } : {}),
    notes: notes.slice(0, 20).map((n) => n.text),
  }
  return { context, refs }
}

/** How each goal in progress is going, for the brief to mention gently. */
export function goalSignals(
  goals: readonly Goal[],
  tasks: readonly Task[],
  entries: readonly TimeEntry[],
  now: Timestamp,
): GoalSignal[] {
  const today = toLocalDate(now)
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => {
      const progress = goalProgress(g, tasks, entries, now)
      const ids = new Set(tasks.filter((t) => t.goalId === g.id).map((t) => t.id))
      const last = Math.max(
        0,
        ...entries.filter((e) => e.taskId && ids.has(e.taskId) && !e.deletedAt).map((e) => e.end ?? now),
      )
      const stage = progress.stages[progress.current]
      return {
        title: g.title,
        stage: stage?.title ?? '',
        weekMinutes: progress.weekMinutes,
        ...(g.weeklyMinutes ? { weeklyMinutes: g.weeklyMinutes } : {}),
        idleDays: last ? Math.floor((now - last) / DAY) : null,
        slipped: tasks.filter(
          (t) =>
            t.goalId === g.id &&
            !t.deletedAt &&
            t.status === 'open' &&
            t.plannedDate !== undefined &&
            t.plannedDate < today,
        ).length,
        reviewDue: reviewDue(g, now),
      }
    })
}

export interface ApplyOptions {
  goal: Goal
  kind: CoachKind
  refs: ReadonlyMap<string, Id>
  /** Which of the proposed tasks the user keeps. */
  picked: readonly boolean[]
  today: LocalDate
  stageId?: string
  /** For a failed check: move on anyway rather than review first. */
  advance?: boolean
}

/**
 * Carries out an accepted proposal through the repositories: new tasks (steps become subtasks),
 * moved days, notes, and what the session itself means — a meeting held, a check recorded and,
 * when passed or skipped past, the stage closed.
 */
export async function applyProposal(proposal: CoachProposal, o: ApplyOptions) {
  const { goal, refs, today } = o
  // Proposed days land on the user's study days, whatever the model picked.
  const day = (d?: string) => (d && d >= today ? onStudyDay(d as LocalDate, goal.studyDays) : undefined)
  const moveOn = o.kind === 'check' && (proposal.check?.passed || o.advance)

  for (const [i, task] of proposal.tasks.entries()) {
    if (!o.picked[i]) continue
    // A failed check that the user skips past needs no review tasks.
    if (o.kind === 'check' && o.advance && !proposal.check?.passed) continue
    const parentId = task.parentRef ? refs.get(task.parentRef) : undefined
    const plannedDate = day(task.plannedDate)
    await tasksRepo.create({
      title: task.title,
      ...(parentId ? { parentId } : { projectId: goal.projectId, goalId: goal.id, stageId: task.stageId }),
      ...(task.notes ? { notes: task.notes } : {}),
      ...(task.estimateMin ? { estimateMin: task.estimateMin } : {}),
      ...(plannedDate ? { plannedDate } : {}),
    })
  }
  for (const move of proposal.moves) {
    const id = refs.get(move.taskRef)
    const date = day(move.date)
    if (id && date) await tasksRepo.update(id, { plannedDate: date })
  }
  for (const text of proposal.notes) {
    await mentorNotesRepo.add({ text: text.slice(0, 300), source: 'mentor', goalId: goal.id })
  }

  if (o.kind === 'review') await goalsRepo.markReviewed(goal.id)
  if (o.kind === 'check' && o.stageId) {
    if (proposal.check) await goalsRepo.addCheck(goal.id, o.stageId, { at: Date.now(), ...proposal.check })
    if (moveOn) await goalsRepo.completeStage(goal.id, o.stageId)
  }
}
