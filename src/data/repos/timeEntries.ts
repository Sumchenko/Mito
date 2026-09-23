import { db } from '../db'
import { DomainError } from '../errors'
import { alive, created } from '../meta'
import type { Id, TimeEntry, TimeEntrySource, Timestamp } from '../types'
import { requireAlive } from './common'

/** Manual entries may end slightly in the future to tolerate clock skew between devices. */
const FUTURE_TOLERANCE_MS = 60_000

async function checkTask(taskId: Id | undefined | null) {
  if (taskId != null) await requireAlive(db.tasks, taskId, 'Task')
}

/** Throws if [start, end) intersects any other live entry. `end = null` means open-ended. */
async function assertNoOverlap(start: Timestamp, end: Timestamp | null, excludeId?: Id) {
  const clash = (await timeEntriesRepo.inRange(start, end ?? Infinity)).find(
    (e) => e.id !== excludeId,
  )
  if (clash) {
    throw new DomainError('time_overlap', `Overlaps with time entry ${clash.id}`)
  }
}

function checkInterval(start: Timestamp, end: Timestamp | null) {
  if (!Number.isFinite(start)) throw new DomainError('invalid', 'start must be a timestamp')
  if (end !== null && !(end > start)) throw new DomainError('invalid', 'end must be after start')
  if (end !== null && end > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new DomainError('invalid', 'Tracked time cannot end in the future')
  }
}

export const timeEntriesRepo = {
  /**
   * The running entry, if any. Entries never overlap, so a running entry is always the one
   * that started last — no extra index needed.
   */
  async running(): Promise<TimeEntry | undefined> {
    const latest = await db.timeEntries.orderBy('start').reverse().filter(alive).first()
    return latest && latest.end === null ? latest : undefined
  },

  /** Starts the timer. A timer that is already running is stopped first. */
  async start(input: { taskId?: Id; source?: TimeEntrySource; at?: Timestamp } = {}) {
    return db.transaction('rw', db.timeEntries, db.tasks, async () => {
      const at = input.at ?? Date.now()
      await checkTask(input.taskId)
      const current = await timeEntriesRepo.running()
      if (current) {
        if (at <= current.start) throw new DomainError('invalid', 'Cannot start before the running entry')
        await db.timeEntries.update(current.id, { end: at, updatedAt: at })
      }
      await assertNoOverlap(at, null)
      const entry: TimeEntry = {
        ...created(),
        start: at,
        end: null,
        source: input.source ?? 'timer',
        ...(input.taskId ? { taskId: input.taskId } : {}),
      }
      await db.timeEntries.add(entry)
      return entry
    })
  },

  /** Stops the running entry and returns it, or `undefined` if nothing was running. */
  async stop(at: Timestamp = Date.now()): Promise<TimeEntry | undefined> {
    return db.transaction('rw', db.timeEntries, async () => {
      const current = await timeEntriesRepo.running()
      if (!current) return undefined
      const end = Math.max(at, current.start + 1)
      await db.timeEntries.update(current.id, { end, updatedAt: Date.now() })
      return { ...current, end }
    })
  },

  async addManual(input: { taskId?: Id; start: Timestamp; end: Timestamp; note?: string }) {
    return db.transaction('rw', db.timeEntries, db.tasks, async () => {
      checkInterval(input.start, input.end)
      await checkTask(input.taskId)
      await assertNoOverlap(input.start, input.end)
      const entry: TimeEntry = {
        ...created(),
        start: input.start,
        end: input.end,
        source: 'manual',
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      }
      await db.timeEntries.add(entry)
      return entry
    })
  },

  /** Edits an entry. `taskId: null` detaches it from its task. */
  async update(
    id: Id,
    patch: { taskId?: Id | null; start?: Timestamp; end?: Timestamp; note?: string | null },
  ) {
    await db.transaction('rw', db.timeEntries, db.tasks, async () => {
      const entry = await requireAlive(db.timeEntries, id, 'Time entry')
      const start = patch.start ?? entry.start
      const end = patch.end ?? entry.end
      checkInterval(start, end)
      await checkTask(patch.taskId)
      if (start !== entry.start || end !== entry.end) await assertNoOverlap(start, end, id)

      const changes: Partial<TimeEntry> = { start, end, updatedAt: Date.now() }
      if (patch.taskId !== undefined) changes.taskId = patch.taskId ?? undefined
      if (patch.note !== undefined) changes.note = patch.note?.trim() || undefined
      await db.timeEntries.update(id, changes)
    })
  },

  /** Attaches several entries (e.g. untracked "no task" time) to a task at once. */
  async assignTask(entryIds: Id[], taskId: Id) {
    await db.transaction('rw', db.timeEntries, db.tasks, async () => {
      await checkTask(taskId)
      const now = Date.now()
      await db.timeEntries.where('id').anyOf(entryIds).filter(alive).modify({ taskId, updatedAt: now })
    })
  },

  async remove(id: Id) {
    await requireAlive(db.timeEntries, id, 'Time entry')
    const now = Date.now()
    await db.timeEntries.update(id, { deletedAt: now, updatedAt: now })
  },

  /** Live entries intersecting [from, to), including the running one. Sorted by start. */
  async inRange(from: Timestamp, to: Timestamp): Promise<TimeEntry[]> {
    const finished = await db.timeEntries
      .where('end')
      .above(from)
      .filter((e) => alive(e) && e.start < to)
      .toArray()
    const running = await timeEntriesRepo.running()
    if (running && running.start < to) finished.push(running)
    return finished.sort((a, b) => a.start - b.start)
  },
}

/** Duration in ms, counting a running entry up to `now`. */
export const entryDuration = (e: TimeEntry, now = Date.now()) => (e.end ?? now) - e.start
