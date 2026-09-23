import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Id } from '@/data'

interface ExpandedState {
  /** Tasks whose subtasks are unfolded inline in lists. */
  ids: Record<Id, true>
  setExpanded: (id: Id, expanded: boolean) => void
}

/** UI memory only — survives navigation and reloads, never synced. */
export const useExpanded = create<ExpandedState>()(
  persist(
    (set) => ({
      ids: {},
      setExpanded: (id, expanded) =>
        set((s) => {
          const ids = { ...s.ids }
          if (expanded) ids[id] = true
          else delete ids[id]
          return { ids }
        }),
    }),
    { name: 'mito.tasks.expanded', version: 1 },
  ),
)
