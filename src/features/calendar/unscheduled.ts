import { useMemo } from 'react'
import type { LocalDate } from '@/data'
import type { CalendarLookup } from './zoom/useZoomData'

/**
 * Open tasks planned for the visible days that have no block yet, plus undated ones.
 * Parents whose subtasks are scheduled are still listed: the parent itself has no time yet.
 */
export function useUnscheduled(days: LocalDate[], data: CalendarLookup) {
  return useMemo(() => {
    const scheduled = new Set(data.blocks.flatMap((b) => (b.taskId ? [b.taskId] : [])))
    const first = days[0]!
    const last = days[days.length - 1]!
    const open = data.tasks.filter((x) => x.status === 'open' && !scheduled.has(x.id))
    const planned = open
      .filter((x) => x.plannedDate && x.plannedDate >= first && x.plannedDate <= last)
      .sort((a, b) => a.plannedDate!.localeCompare(b.plannedDate!) || a.order - b.order)
    const undated = open.filter((x) => !x.plannedDate && !x.parentId).slice(0, 12)
    return { planned, undated, count: planned.length + undated.length }
  }, [data.blocks, data.tasks, days])
}
