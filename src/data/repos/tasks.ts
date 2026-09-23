import { isLocalDate } from '../dates'
import { db } from '../db'
import { DomainError } from '../errors'
import { alive, created, definedOnly } from '../meta'
import type { Id, LocalDate, Priority, Task, TaskStatus } from '../types'
import { ORDER_STEP, requireAlive, requireName } from './common'

export interface TaskInput {
  title: string
  notes?: string
  projectId?: Id
  parentId?: Id
  tagIds?: Id[]
  priority?: Priority
  estimateMin?: number
  plannedDate?: LocalDate
  dueDate?: LocalDate
}

/** In a patch, `null` clears an optional field; `undefined` leaves it untouched. */
export type TaskPatch = {
  [K in keyof Omit<TaskInput, 'title' | 'tagIds' | 'priority'>]?: TaskInput[K] | null
} & Partial<Pick<TaskInput, 'title' | 'tagIds' | 'priority'>> & { order?: number }

function checkOptionalDate(value: unknown, field: string) {
  if (value != null && !isLocalDate(value)) {
    throw new DomainError('invalid', `${field} must be a YYYY-MM-DD date`)
  }
}

function checkEstimate(value: number | null | undefined) {
  if (value != null && (!Number.isInteger(value) || value <= 0)) {
    throw new DomainError('invalid', 'estimateMin must be a positive whole number of minutes')
  }
}

async function checkRefs(input: {
  projectId?: Id | null
  tagIds?: Id[]
}) {
  if (input.projectId != null) await requireAlive(db.projects, input.projectId, 'Project')
  for (const tagId of input.tagIds ?? []) await requireAlive(db.tags, tagId, 'Tag')
}

/** Validates the parent and returns it. Only one nesting level: a subtask cannot have children. */
async function checkParent(parentId: Id, selfId?: Id): Promise<Task> {
  if (parentId === selfId) throw new DomainError('invalid', 'A task cannot be its own parent')
  const parent = await requireAlive(db.tasks, parentId, 'Parent task')
  if (parent.parentId) throw new DomainError('nesting_too_deep', 'Subtasks cannot have subtasks')
  if (selfId) {
    const hasChildren = await db.tasks.where('parentId').equals(selfId).filter(alive).count()
    if (hasChildren) {
      throw new DomainError('nesting_too_deep', 'A task with subtasks cannot become a subtask')
    }
  }
  return parent
}

const PRIORITIES: readonly Priority[] = [0, 1, 2, 3]

export const tasksRepo = {
  get: (id: Id) => db.tasks.get(id).then((t) => (alive(t) ? t : undefined)),

  async create(input: TaskInput): Promise<Task> {
    return db.transaction('rw', db.tasks, db.projects, db.tags, async () => {
      checkOptionalDate(input.plannedDate, 'plannedDate')
      checkOptionalDate(input.dueDate, 'dueDate')
      checkEstimate(input.estimateMin)
      if (input.priority !== undefined && !PRIORITIES.includes(input.priority)) {
        throw new DomainError('invalid', 'Unknown priority')
      }
      await checkRefs(input)

      let projectId = input.projectId
      if (input.parentId) {
        const parent = await checkParent(input.parentId)
        projectId = parent.projectId // subtasks always live in their parent's project
      }

      const last = await db.tasks.orderBy('order').last()
      const task: Task = {
        ...created(),
        title: requireName(input.title, 'Task title'),
        notes: input.notes?.trim() || undefined,
        projectId,
        parentId: input.parentId,
        tagIds: [...new Set(input.tagIds ?? [])],
        status: 'open',
        priority: input.priority ?? 0,
        estimateMin: input.estimateMin,
        plannedDate: input.plannedDate,
        dueDate: input.dueDate,
        order: (last?.order ?? 0) + ORDER_STEP,
      }
      await db.tasks.add(definedOnly(task) as Task)
      return task
    })
  },

  async update(id: Id, patch: TaskPatch) {
    await db.transaction('rw', db.tasks, db.projects, db.tags, async () => {
      const task = await requireAlive(db.tasks, id, 'Task')
      checkOptionalDate(patch.plannedDate, 'plannedDate')
      checkOptionalDate(patch.dueDate, 'dueDate')
      checkEstimate(patch.estimateMin)
      if (patch.priority !== undefined && !PRIORITIES.includes(patch.priority)) {
        throw new DomainError('invalid', 'Unknown priority')
      }
      await checkRefs(patch)

      const now = Date.now()
      const changes: Partial<Task> = { updatedAt: now }
      if (patch.title !== undefined) changes.title = requireName(patch.title, 'Task title')
      if (patch.tagIds !== undefined) changes.tagIds = [...new Set(patch.tagIds)]
      if (patch.priority !== undefined) changes.priority = patch.priority
      if (patch.order !== undefined) changes.order = patch.order
      for (const key of ['notes', 'estimateMin', 'plannedDate', 'dueDate'] as const) {
        if (patch[key] !== undefined) Object.assign(changes, { [key]: patch[key] ?? undefined })
      }

      if (patch.parentId !== undefined) {
        if (patch.parentId === null) {
          changes.parentId = undefined
        } else {
          const parent = await checkParent(patch.parentId, id)
          changes.parentId = parent.id
          changes.projectId = parent.projectId
        }
      }
      if (patch.projectId !== undefined && !(changes.parentId ?? task.parentId)) {
        changes.projectId = patch.projectId ?? undefined
      }

      await db.tasks.update(id, changes)

      // Subtasks follow their parent when it moves between projects.
      if ('projectId' in changes && !task.parentId) {
        await db.tasks
          .where('parentId')
          .equals(id)
          .modify((sub) => {
            if (changes.projectId) sub.projectId = changes.projectId
            else delete sub.projectId
            sub.updatedAt = now
          })
      }
    })
  },

  async setStatus(id: Id, status: TaskStatus) {
    await requireAlive(db.tasks, id, 'Task')
    const now = Date.now()
    await db.tasks.update(id, {
      status,
      completedAt: status === 'done' ? now : undefined,
      updatedAt: now,
    })
  },

  /**
   * Soft-deletes the task and its subtasks. Tracked time is kept (it happened), a running
   * timer on these tasks is stopped, and future planned blocks for them are removed.
   */
  async remove(id: Id) {
    await db.transaction('rw', db.tasks, db.timeEntries, db.timeBlocks, async () => {
      await requireAlive(db.tasks, id, 'Task')
      const now = Date.now()
      const subIds = (await db.tasks.where('parentId').equals(id).filter(alive).toArray()).map(
        (t) => t.id,
      )
      const ids = [id, ...subIds]

      await db.tasks.where('id').anyOf(ids).modify({ deletedAt: now, updatedAt: now })
      await db.timeEntries
        .where('taskId')
        .anyOf(ids)
        .filter((e) => alive(e) && e.end === null)
        .modify({ end: now, updatedAt: now })
      await db.timeBlocks
        .where('taskId')
        .anyOf(ids)
        .filter((b) => alive(b) && b.start >= now)
        .modify({ deletedAt: now, updatedAt: now })
    })
  },

  // ---------- Queries ----------

  /** All live tasks. Lists are derived in memory — cheap at personal-task scale. */
  async listAll(): Promise<Task[]> {
    return (await db.tasks.orderBy('order').toArray()).filter(alive)
  },

  async listPlannedFor(day: LocalDate): Promise<Task[]> {
    const tasks = await db.tasks.where('plannedDate').equals(day).filter(alive).toArray()
    return tasks.sort((a, b) => a.order - b.order)
  },

  /** `null` lists the inbox (tasks without a project). Top-level tasks only. */
  async listByProject(projectId: Id | null): Promise<Task[]> {
    const tasks =
      projectId === null
        ? await db.tasks.filter((t) => alive(t) && !t.projectId && !t.parentId).toArray()
        : await db.tasks
            .where('projectId')
            .equals(projectId)
            .filter((t) => alive(t) && !t.parentId)
            .toArray()
    return tasks.sort((a, b) => a.order - b.order)
  },

  async listSubtasks(parentId: Id): Promise<Task[]> {
    const tasks = await db.tasks.where('parentId').equals(parentId).filter(alive).toArray()
    return tasks.sort((a, b) => a.order - b.order)
  },
}

