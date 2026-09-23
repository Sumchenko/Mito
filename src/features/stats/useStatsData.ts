import { useMemo } from 'react'
import {
  buildReport,
  dailyTracked,
  periodOf,
  periodRange,
  shiftPeriod,
  streaks,
  weekday,
  type Period,
} from '@/analytics'
import {
  addDays,
  startOfLocalDate,
  toLocalDate,
  useAllTasks,
  useNow,
  useProjects,
  useTags,
  useTimeBlocks,
  useTimeEntries,
  useTrackedTotals,
  type Id,
  type LocalDate,
  type Project,
  type Tag,
  type Task,
} from '@/data'

/** Weeks shown on the activity map. */
export const MAP_WEEKS = 53

/**
 * Days shown on the activity map: the selected year, or the 53 weeks that end with the
 * period (never later than today).
 */
export function mapRange(period: Period, today: LocalDate): { from: LocalDate; to: LocalDate } {
  if (period.kind === 'year') {
    const from = periodOf('week', period.from).from
    return { from, to: period.to }
  }
  const end = period.to < today ? period.to : today
  const lastMonday = addDays(end, -weekday(end))
  return { from: addDays(lastMonday, -7 * (MAP_WEEKS - 1)), to: addDays(lastMonday, 6) }
}

/**
 * Everything the statistics page needs, from one set of live queries: the selected period,
 * the one before it (for comparison), and daily totals for the activity map and streaks.
 */
export function useStatsData(period: Period) {
  const now = useNow(60_000)
  const today = toLocalDate(now)
  const previous = shiftPeriod(period, -1)
  const map = mapRange(period, today)

  // One entry query covers the comparison period, the map and the streak up to today.
  const [pFrom] = periodRange(previous)
  const [, cTo] = periodRange(period)
  const from = Math.min(pFrom, startOfLocalDate(map.from))
  const to = Math.max(cTo, startOfLocalDate(addDays(today, 1)), startOfLocalDate(addDays(map.to, 1)))

  const entries = useTimeEntries(from, to)
  const blocks = useTimeBlocks(pFrom, cTo)
  const tasks = useAllTasks()
  const projects = useProjects(true)
  const tags = useTags()
  const totals = useTrackedTotals()

  return useMemo(() => {
    if (!entries || !blocks || !tasks || !projects || !tags || !totals) return null
    const input = { now, entries, blocks, tasks, trackedTotals: totals }
    const report = buildReport({ ...input, period })
    const prev = buildReport({ ...input, period: previous })
    const daily = dailyTracked(entries, from, to, now)

    const taskById = new Map<Id, Task>(tasks.map((t) => [t.id, t]))
    const projectById = new Map<Id, Project>(projects.map((p) => [p.id, p]))
    const tagById = new Map<Id, Tag>(tags.map((t) => [t.id, t]))
    const projectTint = (id: Id | null) => {
      const p = id ? projectById.get(id) : undefined
      return p ? `var(--tint-${p.color})` : 'var(--text-tertiary)'
    }

    return {
      report,
      prev,
      daily,
      map,
      streak: streaks(daily, today),
      today,
      /** Anything tracked at all yet — distinguishes "empty period" from "new user". */
      hasHistory: entries.length > 0,
      taskById,
      projectById,
      tagById,
      projectTint,
    }
    // `previous`/`map` are derived from `period` and `today`; keyed by their dates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, blocks, tasks, projects, tags, totals, now, period.kind, period.from, period.to, today, from, to])
}

export type StatsData = NonNullable<ReturnType<typeof useStatsData>>
