import { db } from '../db'
import { alive, created, definedOnly } from '../meta'
import type { Id, Tag, TintKey } from '../types'
import { requireAlive, requireName, requireTint, tintAt } from './common'

export const tagsRepo = {
  async list(): Promise<Tag[]> {
    return (await db.tags.orderBy('name').toArray()).filter(alive)
  },

  async create(input: { name: string; color?: TintKey }): Promise<Tag> {
    const count = await db.tags.count()
    const tag: Tag = {
      ...created(),
      name: requireName(input.name, 'Tag name'),
      color: requireTint(input.color ?? tintAt(count)),
    }
    await db.tags.add(tag)
    return tag
  },

  async update(id: Id, patch: { name?: string; color?: TintKey }) {
    await requireAlive(db.tags, id, 'Tag')
    await db.tags.update(id, {
      ...definedOnly({
        name: patch.name === undefined ? undefined : requireName(patch.name, 'Tag name'),
        color: patch.color === undefined ? undefined : requireTint(patch.color),
      }),
      updatedAt: Date.now(),
    })
  },

  /** Deletes the tag and detaches it from every task. */
  async remove(id: Id) {
    await db.transaction('rw', db.tags, db.tasks, async () => {
      await requireAlive(db.tags, id, 'Tag')
      const now = Date.now()
      await db.tags.update(id, { deletedAt: now, updatedAt: now })
      await db.tasks
        .where('tagIds')
        .equals(id)
        .modify((task) => {
          task.tagIds = task.tagIds.filter((t) => t !== id)
          task.updatedAt = now
        })
    })
  },
}
