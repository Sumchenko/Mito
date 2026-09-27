import { describe, expect, it } from 'vitest'
import {
  parseChat,
  parseIntake,
  parsePlan,
  parseRequest,
  parseRoadmap,
  readableRefs,
  type IntakeResponse,
  type MentorContext,
  type MentorRequest,
  type RoadmapResponse,
} from '../../src/mentor/protocol.ts'
import { loadConfig } from './config.ts'
import { createLimiter } from './limits.ts'
import { extractJson, MentorFailure, runMentor } from './mentor.ts'
import { mockRespond } from './mock.ts'
import { buildMessages, dates } from './prompts.ts'
import { mockProvider, openAICompatible, ProviderError, type Provider } from './providers.ts'

const context: MentorContext = {
  now: '2026-09-27T10:05',
  weekday: 'Sunday',
  today: '2026-09-27',
  timezone: 'Europe/Moscow',
  workHours: { start: '09:00', end: '18:00' },
  tasks: [
    {
      ref: 't1',
      title: 'Report',
      priority: 3,
      estimateMin: 60,
      trackedMin: 0,
      dueDate: '2026-09-27',
      scheduled: false,
    },
    { ref: 't2', title: 'Read', priority: 1, trackedMin: 0, scheduled: false },
    { ref: 't3', title: 'Already planned', priority: 2, trackedMin: 0, scheduled: true },
  ],
  blocks: [
    { ref: 'b1', date: '2026-09-27', start: '11:00', end: '12:00', title: 'Call', kind: 'event' },
  ],
  trackedToday: [],
  history: {
    days: 14,
    avgTrackedMin: 200,
    activeDays: 10,
    planCompletion: 0.7,
    estimateRatio: 1.2,
    peak: 'Tue 10:00–12:00',
    projects: [],
  },
}
const refs = new Set(['t1', 't2', 't3', 'b1'])
const plan: MentorRequest = { mode: 'plan', lang: 'ru', context, date: '2026-09-27' }

describe('protocol', () => {
  it('keeps only well-formed items with known refs', () => {
    const parsed = parsePlan(
      {
        summary: 'ok',
        blocks: [
          { taskRef: 't1', date: '2026-09-27', start: '12:00', end: '13:00' },
          { taskRef: 'nope', date: '2026-09-27', start: '13:00', end: '14:00' },
          { taskRef: 't2', date: '2026-09-27', start: '15:00', end: '14:00' },
          { title: 'Break', kind: 'break', date: '2026-09-27', start: '13:00', end: '13:15' },
        ],
      },
      refs,
    )
    expect(parsed?.blocks).toEqual([
      { taskRef: 't1', date: '2026-09-27', start: '12:00', end: '13:00' },
      { title: 'Break', kind: 'break', date: '2026-09-27', start: '13:00', end: '13:15' },
    ])
    expect(parsePlan({ summary: 'no blocks' }, refs)).toBeNull()
  })

  it('validates chat actions', () => {
    const parsed = parseChat(
      {
        reply: 'Sure',
        actions: [
          { type: 'create_task', title: 'Call bank', estimateMin: 30, priority: 9 },
          { type: 'move_block', blockRef: 'b1', date: '2026-09-27', start: '15:00', end: '16:00' },
          {
            type: 'move_block',
            blockRef: 'b999',
            date: '2026-09-27',
            start: '15:00',
            end: '16:00',
          },
          { type: 'delete_everything' },
        ],
      },
      refs,
    )
    expect(parsed?.actions).toEqual([
      { type: 'create_task', title: 'Call bank', estimateMin: 30 },
      { type: 'move_block', blockRef: 'b1', date: '2026-09-27', start: '15:00', end: '16:00' },
    ])
  })

  it('rejects malformed requests', () => {
    expect(parseRequest(plan)).not.toBeNull()
    expect(parseRequest({ ...plan, lang: 'de' })).toBeNull()
    expect(
      parseRequest({
        mode: 'chat',
        lang: 'ru',
        context,
        messages: [{ role: 'assistant', content: 'hi' }],
      }),
    ).toBeNull()
  })

  it('replaces refs in prose with titles', () => {
    expect(readableRefs('Начните с t1, потом t2.', context, 'ru')).toBe(
      'Начните с «Report», потом «Read».',
    )
    expect(readableRefs('Focus on t1 “Report” and Report (t1); keep b1, skip t9.', context, 'en')).toBe(
      'Focus on “Report” and Report; keep “Call”, skip t9.',
    )
    expect(readableRefs('Задача «t2» ждёт', context, 'ru')).toBe('Задача «Read» ждёт')
  })

  it('keeps a due date on proposed tasks', () => {
    const out = parseChat(
      { reply: 'ok', actions: [{ type: 'create_task', title: 'X', dueDate: '2026-10-02' }] },
      refs,
    )
    expect(out?.actions).toEqual([{ type: 'create_task', title: 'X', dueDate: '2026-10-02' }])
  })

  it('lists upcoming dates with weekdays', () => {
    const list = dates('2026-09-27', 7)
    expect(list.startsWith('today (Sun) 2026-09-27, tomorrow (Mon) 2026-09-28, Tue 2026-09-29')).toBe(true)
    expect(list).toContain('Fri 2026-10-02')
  })

  it('extracts JSON from fenced answers', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(extractJson('no json')).toBeUndefined()
  })
})

describe('runMentor', () => {
  const failing: Provider = {
    name: 'down',
    complete: async () => {
      throw new ProviderError('HTTP 429', 429)
    },
  }
  const answering = (text: string): Provider & { calls: number } => {
    const p = { name: 'ok', calls: 0, complete: async () => (p.calls++, text) }
    return p
  }

  it('falls back to the next provider when one fails', async () => {
    const ok = answering('{"summary": "s", "blocks": []}')
    const { provider } = await runMentor(plan, [failing, ok])
    expect(provider).toBe('ok')
  })

  it('asks again once after a wrong shape, then moves on', async () => {
    const bad = answering('I think you should rest.')
    await expect(runMentor(plan, [bad])).rejects.toBeInstanceOf(MentorFailure)
    expect(bad.calls).toBe(2)
  })

  it('talks the OpenAI protocol', async () => {
    let seen: { url: string; body: { model: string; response_format: unknown } } | undefined
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(init.body as string) }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"text":"hi","focus":[]}' } }] }),
      )
    }) as unknown as typeof fetch
    const p = openAICompatible(
      { name: 'g', baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' },
      fakeFetch,
    )
    expect(await p.complete([], plan)).toContain('hi')
    expect(seen?.url).toBe('https://x/v1/chat/completions')
    expect(seen?.body.response_format).toEqual({ type: 'json_object' })
  })
})

describe('learning goals', () => {
  const about = {
    today: '2026-09-27',
    weekday: 'Sunday',
    workHours: { start: '09:00', end: '18:00' },
    avgTrackedMin: 120,
    activeDays: 10,
    goals: [],
  }
  const intake: MentorRequest = {
    mode: 'intake',
    lang: 'ru',
    about,
    profile: { subject: 'Python', weeklyMinutes: 300 },
    messages: [{ role: 'user', content: 'Хочу выучить Python' }],
  }

  it('accepts intake requests without the full context', () => {
    expect(parseRequest(intake)).toMatchObject({ mode: 'intake', profile: { subject: 'Python' } })
    expect(parseRequest({ ...intake, messages: [] })).toBeNull()
    expect(parseRequest({ ...intake, about: undefined })).toBeNull()
  })

  it('keeps earlier answers when the model forgets them', () => {
    const out = parseIntake(
      {
        reply: 'Что уже знаете?',
        options: ['С нуля', '', 'x'.repeat(100), 'С нуля'],
        profile: { level: 'beginner', weeklyMinutes: 'soon', targetDate: 'tomorrow' },
      },
      { subject: 'Python', weeklyMinutes: 300 },
    )
    expect(out).toEqual({
      reply: 'Что уже знаете?',
      options: ['С нуля'],
      profile: { subject: 'Python', weeklyMinutes: 300, level: 'beginner' },
      done: false,
    })
    expect(parseIntake({ options: [] })).toBeNull()
    const past = parseIntake({ reply: 'ok', profile: { targetDate: '2026-06-01' } }, {}, '2026-09-27')
    expect(past?.profile.targetDate).toBeUndefined()
  })

  it('keeps the valid part of a roadmap', () => {
    const out = parseRoadmap({
      title: 'Python',
      summary: 'Practice first',
      stages: [
        { id: 's1', title: 'Basics', outcome: 'Writes scripts', weeks: 2 },
        { id: 's1', title: 'Dup', outcome: 'x' },
        { title: 'No outcome' },
        { title: 'Data', outcome: 'Cleans a CSV', weeks: 400 },
      ],
      tasks: [
        { title: 'Loops', stageId: 's1', estimateMin: 45, plannedDate: '2026-09-28' },
        { title: 'Lost stage', stageId: 's9', estimateMin: 2 },
        { stageId: 's1' },
      ],
      notes: ['Studies in the evening', 42],
    })
    expect(out?.stages).toEqual([
      { id: 's1', title: 'Basics', outcome: 'Writes scripts', weeks: 2 },
      { id: 's2', title: 'Data', outcome: 'Cleans a CSV' },
    ])
    expect(out?.tasks).toEqual([
      { title: 'Loops', stageId: 's1', estimateMin: 45, plannedDate: '2026-09-28' },
      { title: 'Lost stage', stageId: 's1' },
    ])
    expect(out?.notes).toEqual(['Studies in the evening'])
    expect(parseRoadmap({ title: 'x', stages: [] })).toBeNull()
  })

  it('roadmap requests need a subject', () => {
    const req = { mode: 'roadmap', lang: 'en', context, profile: { subject: 'Python' } }
    expect(parseRequest(req)).toMatchObject({ mode: 'roadmap' })
    expect(parseRequest({ ...req, profile: {} })).toBeNull()
  })

  it('puts the task and its format last in the prompt', () => {
    const [system] = buildMessages(intake)
    expect(system?.content.indexOf('PROFILE SO FAR')).toBeLessThan(system!.content.indexOf('TASK:'))
    expect(system?.content).toContain('"subject":"Python"')
  })

  it('walks the mock through an intake to a roadmap', async () => {
    const res = (await runMentor(intake, [mockProvider])).response as IntakeResponse
    expect(res.profile.level).toBe('Хочу выучить Python')
    const plan = (await runMentor(
      { mode: 'roadmap', lang: 'ru', context, profile: { subject: 'Python' } },
      [mockProvider],
    )).response as RoadmapResponse
    expect(plan.stages.length).toBeGreaterThan(0)
    expect(plan.tasks.every((t) => t.plannedDate! > context.today)).toBe(true)
  })
})

describe('mock mentor', () => {
  it('plans around existing blocks, from now on, by deadline', () => {
    const res = mockRespond(plan) as { blocks: { taskRef?: string; start: string; end: string }[] }
    // An hour from 10:15 would run into the 11:00–12:00 call, so the report goes after it.
    expect(res.blocks[0]).toMatchObject({ taskRef: 't1', start: '12:00', end: '13:00' })
    expect(res.blocks[1]).toMatchObject({ taskRef: 't2', start: '13:15' })
    expect(res.blocks.some((b) => b.taskRef === 't3')).toBe(false)
  })
})

describe('limits', () => {
  it('limits per minute, per day and in total, and refunds our failures', () => {
    let now = Date.UTC(2026, 8, 27, 12)
    const lim = createLimiter(
      ':memory:',
      { perIpDay: 3, perIpMinute: 2, globalDay: 4 },
      's',
      () => now,
    )
    expect(lim.take('1.1.1.1').ok).toBe(true)
    expect(lim.take('1.1.1.1').ok).toBe(true)
    expect(lim.take('1.1.1.1')).toMatchObject({ ok: false, scope: 'minute' })
    now += 61_000
    expect(lim.take('1.1.1.1')).toMatchObject({ ok: true, remaining: 0 })
    now += 61_000
    expect(lim.take('1.1.1.1')).toMatchObject({ ok: false, scope: 'day' })
    lim.refund('1.1.1.1')
    expect(lim.take('1.1.1.1').ok).toBe(true)
    // Other clients share the global cap.
    expect(lim.take('2.2.2.2').ok).toBe(true)
    expect(lim.take('3.3.3.3')).toMatchObject({ ok: false, scope: 'global' })
    // A new day, a new quota.
    now += 86_400_000
    expect(lim.take('1.1.1.1').ok).toBe(true)
    lim.close()
  })
})

describe('config', () => {
  it('orders providers with keys and falls back to the mock only in development', () => {
    expect(loadConfig({ MENTOR_GROQ_KEY: 'g' }).providers.map((p) => p.name)).toEqual(['groq'])
    expect(
      loadConfig({ MENTOR_GEMINI_KEY: 'a', MENTOR_GROQ_KEY: 'b' }).providers.map((p) => p.name),
    ).toEqual(['groq', 'gemini', 'gemini-lite'])
    expect(loadConfig({}).providers.map((p) => p.name)).toEqual(['mock'])
    expect(loadConfig({ NODE_ENV: 'production' }).providers).toEqual([])
  })
})
