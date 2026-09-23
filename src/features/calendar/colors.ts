import type { Task, TimeBlockKind } from '@/data'

/** Accent for a block kind; task blocks use their project color instead (see useCalendarData). */
export function kindTint(kind: TimeBlockKind) {
  switch (kind) {
    case 'break':
      return 'var(--text-tertiary)'
    case 'routine':
      return 'var(--tint-teal)'
    case 'event':
      return 'var(--tint-rose)'
    default:
      return 'var(--tint-blue)'
  }
}

/**
 * The task currently dragged from the side panel. HTML drag events do not expose their data
 * during dragover, and the grid needs the estimate to preview the block's length.
 */
export const draggedTask: { current: Task | null } = { current: null }
export const setDraggedTask = (task: Task | null) => {
  draggedTask.current = task
}
