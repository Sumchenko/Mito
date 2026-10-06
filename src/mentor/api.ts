import {
  contextRefs,
  parseBrief,
  parseChat,
  parseCoach,
  parseIntake,
  parsePlan,
  parseRoadmap,
  readableRefs,
  type BriefKind,
  type BriefResponse,
  type ChatMessage,
  type ChatResponse,
  type CoachKind,
  type CoachResponse,
  type GoalContext,
  type IntakeAbout,
  type IntakeProfile,
  type IntakeResponse,
  type MentorContext,
  type MentorErrorCode,
  type MentorLang,
  type MentorRequest,
  type PlanResponse,
  type RoadmapResponse,
} from './protocol'

/** A failed mentor call, with what the user should be told. */
export class MentorApiError extends Error {
  code: MentorErrorCode | 'offline' | 'unreachable'
  retryAfter: number | undefined
  constructor(code: MentorErrorCode | 'offline' | 'unreachable', retryAfter?: number) {
    super(`mentor: ${code}`)
    this.name = 'MentorApiError'
    this.code = code
    this.retryAfter = retryAfter
  }
}

async function call(req: MentorRequest): Promise<unknown> {
  let res: Response
  try {
    res = await fetch('/api/mentor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch {
    throw new MentorApiError('offline')
  }
  // A gateway error without our JSON: the mentor service itself is down (in development, it is
  // simply not started), which is not the same as a failed answer.
  if (!res.ok && res.status >= 502 && res.status <= 504 && !res.headers.get('content-type')?.includes('json')) {
    throw new MentorApiError('unreachable')
  }
  const body = (await res.json().catch(() => null)) as {
    error?: MentorErrorCode
    retryAfter?: number
  } | null
  if (!res.ok) throw new MentorApiError(body?.error ?? 'failed', body?.retryAfter)
  return body
}

/*
 * Answers are checked here as well as on the server: the app only acts on well-formed data that
 * refers to records it actually sent.
 */

export async function requestPlan(
  lang: MentorLang,
  context: MentorContext,
  date: string,
  note?: string,
): Promise<PlanResponse> {
  const out = parsePlan(
    await call({ mode: 'plan', lang, context, date, ...(note ? { note } : {}) }),
    contextRefs(context),
  )
  if (!out) throw new MentorApiError('failed')
  const readable = (text: string) => readableRefs(text, context, lang)
  return {
    summary: readable(out.summary),
    blocks: out.blocks.map((b) => (b.reason ? { ...b, reason: readable(b.reason) } : b)),
  }
}

export async function requestChat(
  lang: MentorLang,
  context: MentorContext,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const out = parseChat(await call({ mode: 'chat', lang, context, messages }), contextRefs(context))
  if (!out) throw new MentorApiError('failed')
  return { ...out, reply: readableRefs(out.reply, context, lang) }
}

export async function requestBrief(
  lang: MentorLang,
  context: MentorContext,
  kind: BriefKind,
): Promise<BriefResponse> {
  const out = parseBrief(await call({ mode: 'brief', lang, context, kind }), contextRefs(context))
  if (!out) throw new MentorApiError('failed')
  return { ...out, text: readableRefs(out.text, context, lang) }
}

/** One turn of getting to know the user's learning goal. */
export async function requestIntake(
  lang: MentorLang,
  about: IntakeAbout,
  profile: IntakeProfile,
  messages: ChatMessage[],
): Promise<IntakeResponse> {
  const out = parseIntake(
    await call({ mode: 'intake', lang, about, profile, messages }),
    profile,
    about.today,
  )
  if (!out) throw new MentorApiError('failed')
  return out
}

export async function requestRoadmap(
  lang: MentorLang,
  context: MentorContext,
  profile: IntakeProfile,
  note?: string,
): Promise<RoadmapResponse> {
  const out = parseRoadmap(
    await call({ mode: 'roadmap', lang, context, profile, ...(note ? { note } : {}) }),
  )
  if (!out) throw new MentorApiError('failed')
  return out
}

/** One turn of a coaching session; an empty conversation lets the mentor open it. */
export async function requestCoach(
  lang: MentorLang,
  kind: CoachKind,
  today: string,
  goal: GoalContext,
  messages: ChatMessage[],
  focus: { taskRef?: string; stageId?: string } = {},
): Promise<CoachResponse> {
  const out = parseCoach(
    await call({ mode: 'coach', lang, kind, today, goal, messages, ...focus }),
    goal,
    { kind, ...(focus.taskRef ? { taskRef: focus.taskRef } : {}) },
  )
  if (!out) throw new MentorApiError('failed')
  const titles = new Map(goal.tasks.map((t) => [t.ref, t.title]))
  const [open, close] = lang === 'ru' ? ['«', '»'] : ['“', '”']
  // Refs slipping into the prose read as titles, as in the other modes.
  return {
    ...out,
    reply: out.reply.replace(/\b(t\d+)\b/g, (m, ref: string) =>
      titles.has(ref) ? `${open}${titles.get(ref)}${close}` : m,
    ),
  }
}
