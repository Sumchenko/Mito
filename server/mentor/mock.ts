import type { MentorRequest, MentorResponse, PlanBlock } from '../../src/mentor/protocol.ts'

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * A rule-based mentor for development and tests: plans unscheduled tasks into the free time of
 * the day by deadline and priority, answers chat with a short echo, and briefs from counts.
 * It exercises the whole pipeline without an API key; the real models do the thinking.
 */
export function mockRespond(req: MentorRequest): MentorResponse {
  const ctx = req.context
  const ru = req.lang === 'ru'

  if (req.mode === 'plan') {
    const busy = ctx.blocks
      .filter((b) => b.date === req.date)
      .map((b) => [toMin(b.start), toMin(b.end)] as const)
      .sort((a, b) => a[0] - b[0])
    const nowMin = req.date === ctx.today ? Math.ceil(toMin(ctx.now.slice(11, 16)) / 15) * 15 : 0
    let cursor = Math.max(toMin(ctx.workHours.start), nowMin)
    const end = toMin(ctx.workHours.end)
    const candidates = ctx.tasks
      .filter((t) => !t.scheduled && !t.parent)
      .sort(
        (a, b) =>
          (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.priority - a.priority,
      )
    const blocks: PlanBlock[] = []
    for (const task of candidates) {
      const length = Math.max(15, Math.round((task.estimateMin ?? 45) / 15) * 15)
      // Skip past anything already on the calendar.
      for (const [s, e] of busy) if (cursor < e && cursor + length > s) cursor = e
      if (cursor + length > end) break
      blocks.push({
        taskRef: task.ref,
        date: req.date,
        start: toTime(cursor),
        end: toTime(cursor + length),
        reason: ru ? 'по сроку и приоритету' : 'by deadline and priority',
      })
      cursor += length + 15
    }
    return {
      summary: ru
        ? `Запланировал ${blocks.length} задач(и) на свободное время.`
        : `Planned ${blocks.length} task(s) into free time.`,
      blocks,
    }
  }

  if (req.mode === 'brief') {
    const due = ctx.tasks.filter((t) => t.dueDate && t.dueDate <= ctx.today)
    const planned = ctx.blocks.filter((b) => b.date === ctx.today).length
    const text = ru
      ? req.kind === 'morning'
        ? `Сегодня в плане ${planned} блоков. Срочных задач: ${due.length}. Начните с самой важной, пока свежая голова.`
        : `За день учтено ${ctx.trackedToday.length} сессий. Перенесите незавершённое на завтра и отдохните.`
      : req.kind === 'morning'
        ? `${planned} blocks planned today, ${due.length} urgent task(s). Start with the most important one.`
        : `${ctx.trackedToday.length} sessions tracked today. Move what is left to tomorrow and rest.`
    return { text, focus: due.slice(0, 3).map((t) => t.ref) }
  }

  const last = req.messages[req.messages.length - 1]!.content
  const wantsTask = /созда|добав|create|add/i.test(last)
  return {
    reply: ru
      ? `(тестовый ментор) Вы написали: «${last.slice(0, 120)}»`
      : `(test mentor) You wrote: "${last.slice(0, 120)}"`,
    actions: wantsTask
      ? [
          {
            type: 'create_task',
            title: last.replace(/^\S+\s*/, '').slice(0, 80) || 'Task',
            plannedDate: ctx.today,
          },
        ]
      : [],
  }
}
