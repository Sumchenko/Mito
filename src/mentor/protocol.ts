/*
 * The mentor protocol, shared by the app and the mentor server (server/mentor). Plain types and
 * hand-written validators only — no imports — so Node can run it as-is and the browser can
 * check what the server sends back.
 *
 * Records are referred to by short refs ("t3", "b7") instead of UUIDs: fewer tokens for the
 * model, and the app keeps the map to real ids, so the model can never touch anything it was
 * not shown.
 */

export type MentorLang = 'ru' | 'en'
export type BriefKind = 'morning' | 'evening'

/** What the app tells the mentor about the user. Built by src/mentor/context.ts. */
export interface MentorContext {
  /** Local time, "2026-09-27T14:05", with the weekday name for the model's benefit. */
  now: string
  weekday: string
  today: string
  timezone: string
  /** Usual working window, inferred from tracked time ("09:00"–"19:00"). */
  workHours: { start: string; end: string }
  tasks: ContextTask[]
  /** Calendar blocks from today over the next few days. */
  blocks: ContextBlock[]
  /** Time tracked today, in order. */
  trackedToday: { start: string; end: string; title: string }[]
  history: {
    days: number
    avgTrackedMin: number
    activeDays: number
    /** Share of planned task time done the same day (0..1), or null without plans. */
    planCompletion: number | null
    /** Typical actual ÷ estimate of finished tasks; >1 means tasks take longer than estimated. */
    estimateRatio: number | null
    /** Busiest hours, e.g. "Tue 10:00–12:00". */
    peak: string | null
    projects: { name: string; minutes: number }[]
  }
}

export interface ContextTask {
  ref: string
  title: string
  project?: string
  /** 0 none … 3 high. */
  priority: number
  estimateMin?: number
  trackedMin: number
  plannedDate?: string
  dueDate?: string
  /** Has a calendar block that has not ended yet. */
  scheduled: boolean
  parent?: string
}

export interface ContextBlock {
  ref: string
  date: string
  start: string
  end: string
  title: string
  kind: 'task' | 'event' | 'break' | 'routine'
  taskRef?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type MentorRequest =
  | { mode: 'plan'; lang: MentorLang; context: MentorContext; date: string; note?: string }
  | { mode: 'chat'; lang: MentorLang; context: MentorContext; messages: ChatMessage[] }
  | { mode: 'brief'; lang: MentorLang; context: MentorContext; kind: BriefKind }

/** A proposed block: an existing task (taskRef) or a new item by title. */
export interface PlanBlock {
  taskRef?: string
  title?: string
  /** For a titled block that is not a task: a break or an event. */
  kind?: 'break' | 'event'
  date: string
  start: string
  end: string
  reason?: string
}

export interface PlanResponse {
  summary: string
  blocks: PlanBlock[]
}

export type MentorAction =
  | {
      type: 'create_task'
      title: string
      project?: string
      plannedDate?: string
      dueDate?: string
      estimateMin?: number
      priority?: number
    }
  | { type: 'schedule'; taskRef?: string; title?: string; date: string; start: string; end: string }
  | { type: 'move_block'; blockRef: string; date: string; start: string; end: string }
  | { type: 'plan_date'; taskRef: string; date: string }

export interface ChatResponse {
  reply: string
  actions: MentorAction[]
}

export interface BriefResponse {
  text: string
  /** Tasks worth attention now, most important first. */
  focus: string[]
}

export type MentorResponse = PlanResponse | ChatResponse | BriefResponse

export type MentorErrorCode = 'rate_limited' | 'busy' | 'unavailable' | 'bad_request' | 'failed'
export interface MentorError {
  error: MentorErrorCode
  /** Seconds until another request may succeed (rate limits). */
  retryAfter?: number
}

// ---------- Validation ----------

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max = 2000): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max
const optStr = (v: unknown, max = 2000) => v === undefined || v === null || str(v, max)
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

/** A time span on one day with a sane order ("09:00" < "10:30"). */
export const validSpan = (date: unknown, start: unknown, end: unknown) =>
  typeof date === 'string' &&
  DATE.test(date) &&
  typeof start === 'string' &&
  TIME.test(start) &&
  typeof end === 'string' &&
  TIME.test(end) &&
  minutes(end) > minutes(start)

/**
 * Keeps the valid part of what a model returned: well-formed items that refer only to known
 * refs. Returns null when the shape itself is wrong (the server then asks again).
 */
export function parsePlan(raw: unknown, refs: ReadonlySet<string>): PlanResponse | null {
  if (!isObj(raw) || !Array.isArray(raw.blocks)) return null
  const blocks: PlanBlock[] = []
  for (const b of raw.blocks) {
    if (!isObj(b) || !validSpan(b.date, b.start, b.end)) continue
    const taskRef = typeof b.taskRef === 'string' && refs.has(b.taskRef) ? b.taskRef : undefined
    const title = str(b.title, 200) ? (b.title as string).trim() : undefined
    if (!taskRef && !title) continue
    blocks.push({
      ...(taskRef
        ? { taskRef }
        : { title, kind: b.kind === 'event' ? ('event' as const) : ('break' as const) }),
      date: b.date as string,
      start: b.start as string,
      end: b.end as string,
      ...(str(b.reason, 300) ? { reason: (b.reason as string).trim() } : {}),
    })
  }
  return { summary: str(raw.summary) ? (raw.summary as string).trim() : '', blocks }
}

export function parseChat(raw: unknown, refs: ReadonlySet<string>): ChatResponse | null {
  if (!isObj(raw) || !str(raw.reply, 8000)) return null
  const actions: MentorAction[] = []
  for (const a of Array.isArray(raw.actions) ? raw.actions : []) {
    if (!isObj(a)) continue
    const known = (r: unknown) => typeof r === 'string' && refs.has(r)
    if (a.type === 'create_task' && str(a.title, 200)) {
      actions.push({
        type: 'create_task',
        title: (a.title as string).trim(),
        ...(str(a.project, 80) ? { project: (a.project as string).trim() } : {}),
        ...(typeof a.plannedDate === 'string' && DATE.test(a.plannedDate)
          ? { plannedDate: a.plannedDate }
          : {}),
        ...(typeof a.dueDate === 'string' && DATE.test(a.dueDate) ? { dueDate: a.dueDate } : {}),
        ...(typeof a.estimateMin === 'number' && a.estimateMin > 0 && a.estimateMin <= 24 * 60
          ? { estimateMin: Math.round(a.estimateMin) }
          : {}),
        ...(typeof a.priority === 'number' && [0, 1, 2, 3].includes(a.priority)
          ? { priority: a.priority }
          : {}),
      })
    } else if (
      a.type === 'schedule' &&
      validSpan(a.date, a.start, a.end) &&
      (known(a.taskRef) || str(a.title, 200))
    ) {
      actions.push({
        type: 'schedule',
        ...(known(a.taskRef)
          ? { taskRef: a.taskRef as string }
          : { title: (a.title as string).trim() }),
        date: a.date as string,
        start: a.start as string,
        end: a.end as string,
      })
    } else if (a.type === 'move_block' && known(a.blockRef) && validSpan(a.date, a.start, a.end)) {
      actions.push({
        type: 'move_block',
        blockRef: a.blockRef as string,
        date: a.date as string,
        start: a.start as string,
        end: a.end as string,
      })
    } else if (
      a.type === 'plan_date' &&
      known(a.taskRef) &&
      typeof a.date === 'string' &&
      DATE.test(a.date)
    ) {
      actions.push({ type: 'plan_date', taskRef: a.taskRef as string, date: a.date })
    }
  }
  return { reply: (raw.reply as string).trim(), actions: actions.slice(0, 8) }
}

export function parseBrief(raw: unknown, refs: ReadonlySet<string>): BriefResponse | null {
  if (!isObj(raw) || !str(raw.text, 4000)) return null
  const focus = (Array.isArray(raw.focus) ? raw.focus : []).filter(
    (r): r is string => typeof r === 'string' && refs.has(r),
  )
  return { text: (raw.text as string).trim(), focus: focus.slice(0, 5) }
}

/** Every ref the context exposes: the only ones a response may use. */
export function contextRefs(ctx: MentorContext) {
  return new Set([...ctx.tasks.map((t) => t.ref), ...ctx.blocks.map((b) => b.ref)])
}

/**
 * Models are told to name tasks by title, yet refs ("t3") still slip into the prose now and then.
 * Replaces known refs with quoted titles; a ref right next to its title ("t3 «Report»",
 * "Report (t3)") is just dropped.
 */
export function readableRefs(text: string, ctx: MentorContext, lang: MentorLang): string {
  const titles = new Map<string, string>([
    ...ctx.tasks.map((t) => [t.ref, t.title] as const),
    ...ctx.blocks.map((b) => [b.ref, b.title] as const),
  ])
  const [open, close] = lang === 'ru' ? ['«', '»'] : ['“', '”']
  const known = (ref: string) => titles.has(ref)
  return text
    .replace(/\s*\(\s*([tb]\d+)\s*\)/g, (m, ref: string) => (known(ref) ? '' : m))
    .replace(/\b([tb]\d+)\s*(?=[«"“])/g, (m, ref: string) => (known(ref) ? '' : m))
    .replace(/[«"“]?\b([tb]\d+)\b[»"”]?/g, (m, ref: string) =>
      known(ref) ? `${open}${titles.get(ref)}${close}` : m,
    )
}

/** Structural check of an incoming request (server side). Bounded sizes keep prompts cheap. */
export function parseRequest(raw: unknown): MentorRequest | null {
  if (!isObj(raw) || (raw.lang !== 'ru' && raw.lang !== 'en')) return null
  const ctx = raw.context
  if (
    !isObj(ctx) ||
    !str(ctx.now, 40) ||
    !str(ctx.today, 20) ||
    !Array.isArray(ctx.tasks) ||
    ctx.tasks.length > 200 ||
    !Array.isArray(ctx.blocks) ||
    ctx.blocks.length > 300 ||
    !isObj(ctx.history) ||
    !isObj(ctx.workHours)
  ) {
    return null
  }
  const context = ctx as unknown as MentorContext
  if (
    raw.mode === 'plan' &&
    typeof raw.date === 'string' &&
    DATE.test(raw.date) &&
    optStr(raw.note, 500)
  ) {
    return {
      mode: 'plan',
      lang: raw.lang,
      context,
      date: raw.date,
      ...(str(raw.note, 500) ? { note: raw.note as string } : {}),
    }
  }
  if (
    raw.mode === 'chat' &&
    Array.isArray(raw.messages) &&
    raw.messages.length > 0 &&
    raw.messages.length <= 40
  ) {
    const messages = raw.messages.filter(
      (m): m is ChatMessage =>
        isObj(m) && (m.role === 'user' || m.role === 'assistant') && str(m.content, 8000),
    )
    if (messages.length === 0 || messages[messages.length - 1]!.role !== 'user') return null
    return { mode: 'chat', lang: raw.lang, context, messages }
  }
  if (raw.mode === 'brief' && (raw.kind === 'morning' || raw.kind === 'evening')) {
    return { mode: 'brief', lang: raw.lang, context, kind: raw.kind }
  }
  return null
}
