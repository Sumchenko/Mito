/**
 * Domain model. Every entity carries sync metadata so the local-first store can later be
 * reconciled with the server (stage 7) by last-write-wins on `updatedAt`, with deletions
 * propagated as tombstones (`deletedAt`) instead of hard deletes.
 */

/** Epoch milliseconds, UTC. */
export type Timestamp = number

/** Calendar day without time or zone, `YYYY-MM-DD`. Immune to timezone shifts. */
export type LocalDate = `${number}-${number}-${number}`

export type Id = string

export interface SyncMeta {
  id: Id
  createdAt: Timestamp
  updatedAt: Timestamp
  deletedAt?: Timestamp
}

/** Keys of the `--tint-*` design tokens; entities store the key, not a raw color. */
export type TintKey = 'blue' | 'green' | 'violet' | 'orange' | 'rose' | 'teal'

export interface Project extends SyncMeta {
  name: string
  color: TintKey
  order: number
  archivedAt?: Timestamp
}

export interface Tag extends SyncMeta {
  name: string
  color: TintKey
}

export type TaskStatus = 'open' | 'done' | 'cancelled'

/** 0 — none, 1 — low, 2 — medium, 3 — high. */
export type Priority = 0 | 1 | 2 | 3

export interface Task extends SyncMeta {
  title: string
  notes?: string
  projectId?: Id
  /** Set for subtasks. Only one nesting level is allowed. */
  parentId?: Id
  tagIds: Id[]
  status: TaskStatus
  priority: Priority
  estimateMin?: number
  /** The day the user intends to work on it. */
  plannedDate?: LocalDate
  /** Hard deadline. */
  dueDate?: LocalDate
  order: number
  completedAt?: Timestamp
}

export type TimeEntrySource = 'timer' | 'pomodoro' | 'manual'

/** Actual tracked time — the "fact". Entries never overlap; at most one is running. */
export interface TimeEntry extends SyncMeta {
  /** Optional: the timer may start without a task and be assigned later. */
  taskId?: Id
  start: Timestamp
  /** `null` while the timer is running. */
  end: Timestamp | null
  source: TimeEntrySource
  note?: string
}

export type TimeBlockKind = 'task' | 'event' | 'break' | 'routine'

/** Planned calendar block — the "plan". May overlap (plans are wishes, not facts). */
export interface TimeBlock extends SyncMeta {
  taskId?: Id
  /** Required when there is no task (events, breaks, routines). */
  title?: string
  start: Timestamp
  end: Timestamp
  kind: TimeBlockKind
  origin: 'user' | 'mentor'
}
