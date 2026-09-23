import { db } from '../db'
import { alive, created, definedOnly } from '../meta'
import type { Id, Project, TintKey } from '../types'
import { ORDER_STEP, requireAlive, requireName, requireTint, tintAt } from './common'

export interface ProjectInput {
  name: string
  color?: TintKey
}

export const projectsRepo = {
  async list(options: { includeArchived?: boolean } = {}): Promise<Project[]> {
    const all = await db.projects.orderBy('order').toArray()
    return all.filter((p) => alive(p) && (options.includeArchived || !p.archivedAt))
  },

  async create(input: ProjectInput): Promise<Project> {
    return db.transaction('rw', db.projects, async () => {
      const count = await db.projects.count()
      const last = await db.projects.orderBy('order').last()
      const project: Project = {
        ...created(),
        name: requireName(input.name, 'Project name'),
        color: requireTint(input.color ?? tintAt(count)),
        order: (last?.order ?? 0) + ORDER_STEP,
      }
      await db.projects.add(project)
      return project
    })
  },

  async update(id: Id, patch: Partial<Pick<Project, 'name' | 'color' | 'order'>>) {
    await requireAlive(db.projects, id, 'Project')
    await db.projects.update(id, {
      ...definedOnly({
        name: patch.name === undefined ? undefined : requireName(patch.name, 'Project name'),
        color: patch.color === undefined ? undefined : requireTint(patch.color),
        order: patch.order,
      }),
      updatedAt: Date.now(),
    })
  },

  async setArchived(id: Id, archived: boolean) {
    await requireAlive(db.projects, id, 'Project')
    const now = Date.now()
    await db.projects.update(id, { archivedAt: archived ? now : undefined, updatedAt: now })
  },

  /**
   * Deletes the project and moves its tasks to the inbox, so no task — and none of its
   * tracked time — disappears with it. Prefer archiving for finished projects.
   */
  async remove(id: Id) {
    await db.transaction('rw', db.projects, db.tasks, async () => {
      await requireAlive(db.projects, id, 'Project')
      const now = Date.now()
      await db.projects.update(id, { deletedAt: now, updatedAt: now })
      await db.tasks
        .where('projectId')
        .equals(id)
        .modify((task) => {
          delete task.projectId
          task.updatedAt = now
        })
    })
  },
}
