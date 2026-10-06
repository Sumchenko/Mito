import { useTranslation } from 'react-i18next'
import { startOfLocalDate, type LocalDate } from '@/data'
import { MentorApiError } from '@/mentor/api'
import type { MentorAction, MentorContext } from '@/mentor/protocol'

/** Wording shared by the mentor's cards: errors, dates, action labels. */
export function useMentorText() {
  const { t, i18n } = useTranslation()
  const day = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(startOfLocalDate(date as LocalDate)))
  const when = (date: string, start: string, end: string) => `${day(date)}, ${start}–${end}`

  const errorText = (e: unknown) => {
    if (!(e instanceof MentorApiError)) return t('mentor.errors.failed')
    if (e.code === 'unreachable')
      return import.meta.env.DEV ? t('mentor.errors.devServer') : t('mentor.errors.unavailable')
    if (e.code === 'rate_limited') {
      const minutes = Math.ceil((e.retryAfter ?? 60) / 60)
      const later =
        minutes > 90
          ? t('mentor.errors.tomorrow')
          : t('mentor.errors.inMinutes', { count: minutes })
      return t('mentor.errors.rate_limited', { when: later })
    }
    return t(`mentor.errors.${e.code}`)
  }

  /** Fixed when the answer arrives: refs are resolved to titles against that answer's context. */
  const actionLabel = (a: MentorAction, ctx: MentorContext) => {
    const task = (ref?: string) => ctx.tasks.find((x) => x.ref === ref)?.title ?? '—'
    switch (a.type) {
      case 'create_task':
        return (
          t('mentor.actions.create', { title: a.title }) +
          (a.plannedDate
            ? ` · ${a.start && a.end ? when(a.plannedDate, a.start, a.end) : day(a.plannedDate)}`
            : '') +
          (a.dueDate ? ` · ${t('mentor.actions.due', { date: day(a.dueDate) })}` : '')
        )
      case 'schedule':
        if (a.kind === 'break') {
          // "Break «Break»" reads oddly: a generic title is left out.
          return ['перерыв', 'break'].includes(a.title!.toLowerCase().trim())
            ? t('mentor.actions.break', { when: when(a.date, a.start, a.end) })
            : t('mentor.actions.breakNamed', { title: a.title, when: when(a.date, a.start, a.end) })
        }
        return t('mentor.actions.schedule', {
          title: a.taskRef ? task(a.taskRef) : a.title,
          when: when(a.date, a.start, a.end),
        })
      case 'move_block':
        return t('mentor.actions.move', {
          title: ctx.blocks.find((b) => b.ref === a.blockRef)?.title ?? '—',
          when: when(a.date, a.start, a.end),
        })
      case 'plan_date':
        return t('mentor.actions.planDate', { title: task(a.taskRef), date: day(a.date) })
    }
  }

  return { errorText, actionLabel, when, day }
}

/** Models sometimes slip in markdown emphasis; the UI shows plain text. */
export const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '')

/** Mon … Sun as the user's locale writes them (1 Jan 2024 was a Monday). */
export function weekdayNames(lang: string) {
  const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)))
}
