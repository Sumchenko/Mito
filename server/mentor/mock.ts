import type {
  CoachTask,
  IntakeProfile,
  MentorRequest,
  MentorResponse,
  PlanBlock,
  RoadmapTask,
} from '../../src/mentor/protocol.ts'

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/**
 * A rule-based mentor for development and tests: plans unscheduled tasks into the free time of
 * the day by deadline and priority, answers chat with a short echo, and briefs from counts. The
 * intake asks the essential questions in order; the roadmap is a fixed three-stage template.
 * It exercises the whole pipeline without an API key; the real models do the thinking.
 */
export function mockRespond(req: MentorRequest): MentorResponse {
  const ru = req.lang === 'ru'
  if (req.mode === 'intake') return mockIntake(req.profile, lastUser(req.messages), ru)
  if (req.mode === 'roadmap') return mockRoadmap(req.profile, req.context.today, ru)
  if (req.mode === 'coach') return mockCoach(req, ru)
  const ctx = req.context

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

  const last = lastUser(req.messages)
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

const lastUser = (messages: { role: string; content: string }[]) =>
  [...messages].reverse().find((m) => m.role === 'user')?.content.trim() ?? ''

const QUESTIONS = {
  level: {
    ru: ['Что вы уже знаете в этой теме?', ['С нуля', 'Немного пробовал', 'Есть база']],
    en: ['What do you already know about it?', ['From scratch', 'Tried a bit', 'I have the basics']],
  },
  success: {
    ru: ['Какой результат будет для вас успехом?', ['Сделать свой проект', 'Найти работу']],
    en: ['What result would count as success?', ['Build my own project', 'Get a job']],
  },
  weeklyMinutes: {
    ru: ['Сколько времени в неделю вы готовы уделять?', ['2–3 часа', '5 часов', '10 часов']],
    en: ['How much time a week can you give it?', ['2–3 hours', '5 hours', '10 hours']],
  },
} as const

function mockIntake(previous: IntakeProfile, answer: string, ru: boolean): MentorResponse {
  const profile: IntakeProfile = { ...previous }
  // Each answer fills the first field still missing, in the order the questions are asked.
  if (!profile.subject) {
    profile.subject = answer.slice(0, 200)
    profile.title = answer.slice(0, 60)
  } else if (!profile.level) profile.level = answer.slice(0, 200)
  else if (!profile.success) profile.success = answer.slice(0, 200)
  else if (!profile.weeklyMinutes) {
    const hours = Number(answer.match(/\d+/)?.[0] ?? 3)
    profile.weeklyMinutes = Math.min(6000, Math.max(30, hours * 60))
  }
  const next = (['level', 'success', 'weeklyMinutes'] as const).find((k) => !profile[k])
  if (!next) {
    return {
      reply: ru ? '(тестовый ментор) Понял. Составлю план.' : '(test mentor) Got it. A plan comes next.',
      options: [],
      profile,
      done: true,
    }
  }
  const [question, options] = QUESTIONS[next][ru ? 'ru' : 'en']
  return { reply: `(${ru ? 'тестовый ментор' : 'test mentor'}) ${question}`, options: [...options], profile, done: false }
}

function mockRoadmap(profile: IntakeProfile, today: string, ru: boolean): MentorResponse {
  const subject = profile.subject ?? 'the subject'
  const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const tasks: RoadmapTask[] = [1, 2, 4, 5, 7].map((d, i) => ({
    title: ru ? `Занятие ${i + 1}: ${subject}` : `Session ${i + 1}: ${subject}`,
    stageId: 's1',
    estimateMin: 45,
    plannedDate: day(d),
    notes: ru ? 'Тестовое задание' : 'Test task',
  }))
  return {
    title: profile.title ?? subject,
    summary: ru ? '(тестовый ментор) Три этапа от основ к проекту.' : '(test mentor) Three stages from basics to a project.',
    stages: [
      { id: 's1', title: ru ? 'Основы' : 'Basics', outcome: ru ? 'Понимает базовые понятия' : 'Knows the basics', weeks: 2 },
      { id: 's2', title: ru ? 'Практика' : 'Practice', outcome: ru ? 'Решает типовые задачи' : 'Solves typical problems', weeks: 3 },
      { id: 's3', title: ru ? 'Проект' : 'Project', outcome: ru ? 'Сделал свой проект' : 'Built a project', weeks: 3 },
    ],
    tasks,
    notes: profile.level ? [ru ? `Уровень: ${profile.level}` : `Level: ${profile.level}`] : [],
  }
}

const plusDays = (today: string, n: number) =>
  new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Sessions by turn count: review and stuck finish after one answer, the check after three. */
function mockCoach(req: Extract<MentorRequest, { mode: 'coach' }>, ru: boolean): MentorResponse {
  const said = req.messages.filter((m) => m.role === 'user').length
  const tag = ru ? '(тестовый ментор) ' : '(test mentor) '
  const goal = req.goal
  const active = goal.stages.find((s) => s.status === 'active') ?? goal.stages[0]!
  const task = (title: string, day: number, extra: Partial<CoachTask> = {}): CoachTask => ({
    title,
    stageId: active.id,
    estimateMin: 30,
    plannedDate: plusDays(req.today, day),
    ...extra,
  })

  if (req.kind === 'check') {
    if (said < 3)
      return { reply: `${tag}${ru ? 'Вопрос' : 'Question'} ${said + 1}/3`, options: [], done: false }
    const next = goal.stages[goal.stages.indexOf(active) + 1]
    return {
      reply: `${tag}${ru ? 'Хорошо, этап пройден.' : 'Good, the stage is done.'}`,
      options: [],
      done: true,
      proposal: {
        tasks: [task(ru ? 'Первое занятие этапа' : 'First session', 1, { stageId: next?.id ?? active.id })],
        moves: [],
        notes: [],
        check: { score: 0.8, passed: true, gaps: [ru ? 'Повторить основы' : 'Revisit basics'] },
      },
    }
  }
  if (said === 0) {
    return {
      reply: `${tag}${req.kind === 'review' ? (ru ? 'Как прошла неделя?' : 'How did the week go?') : ru ? 'Что именно не получается?' : 'What exactly is hard?'}`,
      options: ru ? ['Хорошо', 'Не хватило времени'] : ['Well', 'No time'],
      done: false,
    }
  }
  const slipped = goal.tasks.filter((t) => t.status === 'open' && t.plannedDate && t.plannedDate < req.today)
  return {
    reply: `${tag}${ru ? 'Вот план.' : 'Here is the plan.'}`,
    options: [],
    done: true,
    proposal:
      req.kind === 'review'
        ? {
            tasks: [task(ru ? 'Занятие недели' : 'Session of the week', 1), task(ru ? 'Повторение' : 'Review', 3)],
            moves: slipped.map((t) => ({ taskRef: t.ref, date: plusDays(req.today, 2) })),
            notes: [],
          }
        : {
            tasks: [1, 2, 3].map((n) =>
              task(`${ru ? 'Шаг' : 'Step'} ${n}`, 0, { estimateMin: 20, ...(req.taskRef ? { parentRef: req.taskRef } : {}) }),
            ),
            moves: [],
            notes: [ru ? 'Трудно начинать большие задачи' : 'Big tasks are hard to start'],
          },
  }
}
