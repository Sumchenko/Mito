import { db } from '../db'
import { DomainError } from '../errors'
import { alive, created } from '../meta'
import type { Id, TimeBlock, TimeBlockKind, Timestamp } from '../types'
import { requireAlive } from './common'

export interface TimeBlockInput {
  taskId?: Id
  title?: string
  start: Timestamp
  end: Timestamp
  kind?: TimeBlockKind
  origin?: TimeBlock['origin']
}

function checkInterval(start: Timestamp, end: Timestamp) {
  if (!Number.isFinite(start) || !(end > start)) {
    throw new DomainError('invalid', 'end must be after start')
  }
}

export const timeBlocksRepo = {
  async create(input: TimeBlockInput): Promise<TimeBlock> {
    return db.transaction('rw', db.timeBlocks, db.tasks, async () => {
      checkInterval(input.start, input.end)
      if (input.taskId) await requireAlive(db.tasks, input.taskId, 'Task')
      const title = input.title?.trim()
      if (!input.taskId && !title) {
        throw new DomainError('invalid', 'A block needs a task or a title')
      }
      const block: TimeBlock = {
        ...created(),
        start: input.start,
        end: input.end,
        kind: input.kind ?? (input.taskId ? 'task' : 'event'),
        origin: input.origin ?? 'user',
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(title ? { title } : {}),
      }
      await db.timeBlocks.add(block)
      return block
    })
  },

  async update(
    id: Id,
    patch: Partial<Pick<TimeBlock, 'start' | 'end' | 'kind'>> & {
      title?: string | null
      taskId?: Id | null
    },
  ) {
    await db.transaction('rw', db.timeBlocks, db.tasks, async () => {
      const block = await requireAlive(db.timeBlocks, id, 'Time block')
      const start = patch.start ?? block.start
      const end = patch.end ?? block.end
      checkInterval(start, end)
      if (patch.taskId) await requireAlive(db.tasks, patch.taskId, 'Task')

      const changes: Partial<TimeBlock> = { start, end, updatedAt: Date.now() }
      if (patch.kind) changes.kind = patch.kind
      if (patch.taskId !== undefined) changes.taskId = patch.taskId ?? undefined
      if (patch.title !== undefined) changes.title = patch.title?.trim() || undefined

      const taskId = patch.taskId === undefined ? block.taskId : changes.taskId
      const title = patch.title === undefined ? block.title : changes.title
      if (!taskId && !title) throw new DomainError('invalid', 'A block needs a task or a title')

      await db.timeBlocks.update(id, changes)
    })
  },

  async remove(id: Id) {
    await requireAlive(db.timeBlocks, id, 'Time block')
    const now = Date.now()
    await db.timeBlocks.update(id, { deletedAt: now, updatedAt: now })
  },

  /** Live blocks intersecting [from, to), sorted by start. */
  async inRange(from: Timestamp, to: Timestamp): Promise<TimeBlock[]> {
    const blocks = await db.timeBlocks
      .where('end')
      .above(from)
      .filter((b) => alive(b) && b.start < to)
      .toArray()
    return blocks.sort((a, b) => a.start - b.start)
  },
}
