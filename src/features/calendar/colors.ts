import type { Task, TimeBlockKind } from '@/data'

/**
 * On the calendar, color means a project. Anything that is not a task — events, breaks,
 * routines — is neutral and told apart by shape and icon instead (see KindIcon).
 */
export const NEUTRAL_TINT = 'var(--block-neutral)'
/** A task outside any project: the app accent, which no project uses. */
export const NO_PROJECT_TINT = 'var(--accent)'

/** Accent for a block kind; task blocks use their project color when they have one. */
export function kindTint(kind: TimeBlockKind) {
  return kind === 'task' ? NO_PROJECT_TINT : NEUTRAL_TINT
}

/**
 * The task currently dragged from the side panel. HTML drag events do not expose their data
 * during dragover, and the grid needs the estimate to preview the block's length.
 */
export const draggedTask: { current: Task | null } = { current: null }
export const setDraggedTask = (task: Task | null) => {
  draggedTask.current = task
}
