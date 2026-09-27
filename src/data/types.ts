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
  /** Set for tasks of a learning plan: the goal and the stage they belong to. */
  goalId?: Id
  stageId?: string
}

export type GoalStatus = 'active' | 'paused' | 'done' | 'dropped'
export type StageStatus = 'upcoming' | 'active' | 'done'

/** A knowledge check at the end of a stage. */
export interface StageCheck {
  at: Timestamp
  /** Share of the check answered well, 0…1. */
  score: number
  passed: boolean
  /** Topics that need another pass, in the mentor's words. */
  gaps: string[]
}

/** One step of a learning plan, with a concrete result ("can load and clean a CSV in pandas"). */
export interface GoalStage {
  /** Short id, unique within the goal ("s1"). */
  id: string
  title: string
  outcome: string
  /** Rough length in weeks, as planned. */
  weeks?: number
  status: StageStatus
  checks?: StageCheck[]
}

/** What the mentor learned about the goal while getting to know the user. */
export interface GoalProfile {
  subject: string
  level?: string
  background?: string
  motivation?: string
  /** What counts as success for the user. */
  success?: string
  /** When and how the user can study (days, time of day). */
  schedule?: string
  /** Preferred ways to learn: video, books, practice… */
  style?: string
  constraints?: string
}

/**
 * A learning goal the mentor leads the user to. Its tasks live in a project of its own, so the
 * calendar, the timer and the statistics work with learning as with anything else.
 */
export interface Goal extends SyncMeta {
  title: string
  status: GoalStatus
  profile: GoalProfile
  stages: GoalStage[]
  projectId?: Id
  targetDate?: LocalDate
  weeklyMinutes?: number
  /** Last weekly meeting; the next one is due a week later. */
  lastReviewAt?: Timestamp
  order: number
  completedAt?: Timestamp
}

/** The mentor's memory: short facts about the user it brings into every conversation. */
export interface MentorNote extends SyncMeta {
  text: string
  goalId?: Id
  source: 'mentor' | 'user'
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
