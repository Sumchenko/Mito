import {
  contextRefs,
  parseBrief,
  parseChat,
  parsePlan,
  readableRefs,
  type BriefKind,
  type BriefResponse,
  type ChatMessage,
  type ChatResponse,
  type MentorContext,
  type MentorErrorCode,
  type MentorLang,
  type MentorRequest,
  type PlanResponse,
} from './protocol'

/** A failed mentor call, with what the user should be told. */
export class MentorApiError extends Error {
  code: MentorErrorCode | 'offline'
  retryAfter: number | undefined
  constructor(code: MentorErrorCode | 'offline', retryAfter?: number) {
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
