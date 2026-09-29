import { isLocalDate } from '../dates'
import { db } from '../db'
import { DomainError } from '../errors'
import { alive, created, definedOnly } from '../meta'
import type {
  Goal,
  GoalProfile,
  GoalStage,
  GoalStatus,
  Id,
  LocalDate,
  Project,
  StageCheck,
  TintKey,
} from '../types'
import { ORDER_STEP, requireAlive, requireName, requireTint, tintAt } from './common'

/** A stage as the mentor proposes it; statuses are managed here. */
export type StageInput = Pick<GoalStage, 'id' | 'title' | 'outcome' | 'weeks'>

export interface GoalInput {
  title: string
  profile: GoalProfile
  stages: StageInput[]
  targetDate?: LocalDate
  weeklyMinutes?: number
  studyDays?: number[]
  /** Color of the goal's project; picked from the palette when omitted. */
  color?: TintKey
}

export type GoalPatch = Partial<
  Pick<GoalInput, 'title' | 'profile' | 'targetDate' | 'weeklyMinutes' | 'studyDays'> & {
    stages: GoalStage[]
  }
>

const STATUSES: readonly GoalStatus[] = ['active', 'paused', 'done', 'dropped']

function checkStages(stages: readonly StageInput[]) {
  if (stages.length === 0) throw new DomainError('invalid', 'A goal needs at least one stage')
  const ids = new Set<string>()
  for (const s of stages) {
    if (!s.id || ids.has(s.id)) throw new DomainError('invalid', `Duplicate stage id ${s.id}`)
    ids.add(s.id)
    requireName(s.title, 'Stage title')
  }
}

/** Distinct weekdays in order; an empty set means "any day" and is not stored. */
function cleanDays(days: readonly number[] | undefined): number[] | undefined {
  if (days === undefined) return undefined
  if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw new DomainError('invalid', 'studyDays are weekdays 0 (Monday) to 6 (Sunday)')
  }
  const set = [...new Set(days)].sort()
  return set.length ? set : undefined
}

function checkPlanFields(input: { targetDate?: LocalDate; weeklyMinutes?: number }) {
  if (input.targetDate !== undefined && !isLocalDate(input.targetDate)) {
    throw new DomainError('invalid', 'targetDate must be a YYYY-MM-DD date')
  }
  if (
    input.weeklyMinutes !== undefined &&
    (!Number.isInteger(input.weeklyMinutes) || input.weeklyMinutes <= 0)
  ) {
    throw new DomainError('invalid', 'weeklyMinutes must be a positive whole number')
  }
}

/** Stages in their initial state: the first one is where the user starts. */
const fresh = (stages: readonly StageInput[]): GoalStage[] =>
  stages.map((s, i) => ({
    ...definedOnly(s),
    title: s.title.trim(),
    outcome: s.outcome.trim(),
    status: i === 0 ? 'active' : 'upcoming',
  })) as GoalStage[]

const touch = (id: Id, change: (goal: Goal) => Partial<Goal>) =>
  db.transaction('rw', db.goals, async () => {
    const goal = await requireAlive(db.goals, id, 'Goal')
    const patch = change(goal)
    await db.goals.update(id, { ...patch, updatedAt: Date.now() })
    return { ...goal, ...patch }
  })

export const goalsRepo = {
  get: (id: Id) => db.goals.get(id).then((g) => (alive(g) ? g : undefined)),

  async list(): Promise<Goal[]> {
    return (await db.goals.orderBy('order').toArray()).filter(alive)
  },

  /** Creates the goal together with the project its tasks will live in. */
  async create(input: GoalInput): Promise<Goal> {
    const title = requireName(input.title, 'Goal title')
    checkStages(input.stages)
    checkPlanFields(input)
    requireName(input.profile.subject, 'Goal subject')
    return db.transaction('rw', db.goals, db.projects, async () => {
      const projects = await db.projects.count()
      const lastProject = await db.projects.orderBy('order').last()
      const project: Project = {
        ...created(),
        name: title,
        color: requireTint(input.color ?? tintAt(projects)),
        order: (lastProject?.order ?? 0) + ORDER_STEP,
      }
      await db.projects.add(project)

      const last = await db.goals.orderBy('order').last()
      const goal: Goal = {
        ...created(),
        title,
        status: 'active',
        profile: definedOnly(input.profile) as GoalProfile,
        stages: fresh(input.stages),
        projectId: project.id,
        targetDate: input.targetDate,
        weeklyMinutes: input.weeklyMinutes,
        studyDays: cleanDays(input.studyDays),
        order: (last?.order ?? 0) + ORDER_STEP,
      }
      await db.goals.add(definedOnly(goal) as Goal)
      return goal
    })
  },

  async update(id: Id, patch: GoalPatch) {
    if (patch.title !== undefined) requireName(patch.title, 'Goal title')
    if (patch.stages) checkStages(patch.stages)
    checkPlanFields(patch)
    const days = cleanDays(patch.studyDays)
    await touch(id, () => ({
      ...definedOnly({
        title: patch.title?.trim(),
        profile: patch.profile && (definedOnly(patch.profile) as GoalProfile),
        stages: patch.stages,
        targetDate: patch.targetDate,
        weeklyMinutes: patch.weeklyMinutes,
      }),
      // An emptied set clears the field: any day will do again.
      ...(patch.studyDays !== undefined ? { studyDays: days } : {}),
    }))
  },

  async setStatus(id: Id, status: GoalStatus) {
    if (!STATUSES.includes(status)) throw new DomainError('invalid', `Unknown status ${status}`)
    await touch(id, () => ({ status, completedAt: status === 'done' ? Date.now() : undefined }))
  },

  /** Closes a stage and opens the next one. Returns the stage that is now active, if any. */
  async completeStage(id: Id, stageId: string): Promise<GoalStage | undefined> {
    const goal = await touch(id, (g) => {
      const at = g.stages.findIndex((s) => s.id === stageId)
      if (at < 0) throw new DomainError('not_found', `Stage ${stageId} not found`)
      const next = g.stages.findIndex((s, i) => i > at && s.status !== 'done')
      return {
        stages: g.stages.map((s, i) =>
          i === at ? { ...s, status: 'done' } : i === next ? { ...s, status: 'active' } : s,
        ),
      }
    })
    return goal.stages?.find((s) => s.status === 'active')
  },

  async addCheck(id: Id, stageId: string, check: StageCheck) {
    if (!(check.score >= 0 && check.score <= 1)) {
      throw new DomainError('invalid', 'A check score is between 0 and 1')
    }
    await touch(id, (g) => {
      if (!g.stages.some((s) => s.id === stageId)) {
        throw new DomainError('not_found', `Stage ${stageId} not found`)
      }
      return {
        stages: g.stages.map((s) =>
          s.id === stageId ? { ...s, checks: [...(s.checks ?? []), check] } : s,
        ),
      }
    })
  },

  async markReviewed(id: Id, at = Date.now()) {
    await touch(id, () => ({ lastReviewAt: at }))
  },

  /** The goal goes; its project and tasks stay — they hold real work and tracked time. */
  async remove(id: Id) {
    await touch(id, () => ({ deletedAt: Date.now() }))
  },
}
