import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addDays,
  startOfLocalDate,
  toLocalDate,
  useAllTasks,
  useGoals,
  useNow,
  useProjects,
  useTimeBlocks,
  useTimeEntries,
  useTrackedTotals,
} from '@/data'
import { AHEAD_DAYS, buildContext, HISTORY_DAYS, type ContextInput } from '@/mentor/context'
import type { MentorLang } from '@/mentor/protocol'

/**
 * Live data the mentor's context is built from. The context itself is built on demand, when a
 * request is sent — not on every render.
 */
export function useMentorInput() {
  const { i18n } = useTranslation()
  const now = useNow(60_000)
  const today = toLocalDate(now)
  const from = startOfLocalDate(addDays(today, -HISTORY_DAYS))
  const to = startOfLocalDate(addDays(today, AHEAD_DAYS))

  const tasks = useAllTasks()
  const projects = useProjects(true)
  const blocks = useTimeBlocks(from, to)
  const entries = useTimeEntries(from, to)
  const totals = useTrackedTotals()
  const goals = useGoals()

  const input = useMemo<ContextInput | null>(
    () =>
      tasks && projects && blocks && entries && totals && goals
        ? { now, tasks, projects, blocks, entries, trackedTotals: totals, goals }
        : null,
    [now, tasks, projects, blocks, entries, totals, goals],
  )
  const lang: MentorLang = i18n.language === 'en' ? 'en' : 'ru'
  return {
    ready: input !== null,
    lang,
    today,
    projects: projects ?? [],
    tasks: tasks ?? [],
    /** A fresh context at the moment of asking (the clock included). */
    context: () => buildContext({ ...input!, now: Date.now() }),
  }
}
