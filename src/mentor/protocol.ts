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
  /** Learning goals in progress: the brief mentions slippage. */
  goals?: GoalSignal[]
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

/**
 * What the mentor learns about a learning goal while getting to know the user. Filled in turn by
 * turn during the intake; the base of the learning plan.
 */
export interface IntakeProfile {
  /** Short name of the goal ("Python for data analysis"). */
  title?: string
  subject?: string
  level?: string
  background?: string
  motivation?: string
  /** What counts as success for the user. */
  success?: string
  /** When the user can study: days, time of day. */
  schedule?: string
  /** Preferred ways to learn: video, books, practice… */
  style?: string
  constraints?: string
  targetDate?: string
  weeklyMinutes?: number
  /** Weekdays the user can study on, 0 = Monday … 6 = Sunday. */
  studyDays?: number[]
}

/**
 * A light picture of the user for the intake: no task lists, so the many short turns of a
 * conversation stay cheap.
 */
export interface IntakeAbout {
  today: string
  weekday: string
  workHours: { start: string; end: string }
  avgTrackedMin: number
  activeDays: number
  /** Titles of goals the user already has. */
  goals: string[]
}

/** How a learning goal is going, for the brief: the mentor mentions slippage in one sentence. */
export interface GoalSignal {
  title: string
  stage: string
  weekMinutes: number
  weeklyMinutes?: number
  /** Days since the last tracked session on the goal; null when there was none yet. */
  idleDays: number | null
  /** Open tasks whose planned day has passed. */
  slipped: number
  reviewDue: boolean
}

export type CoachKind = 'review' | 'stuck' | 'check'

/** What the mentor sees of one learning goal in a coaching session. */
export interface GoalContext {
  title: string
  profile: IntakeProfile
  weeklyMinutes?: number
  targetDate?: string
  stages: {
    id: string
    title: string
    outcome: string
    weeks?: number
    status: 'upcoming' | 'active' | 'done'
    checks?: { score: number; passed: boolean; gaps: string[] }[]
  }[]
  /** Tasks of the goal, referred to by short refs ("t3"). */
  tasks: {
    ref: string
    title: string
    stageId: string
    status: 'open' | 'done'
    plannedDate?: string
    estimateMin?: number
    trackedMin: number
    notes?: string
    parent?: string
  }[]
  /** Minutes per week, oldest first, this week last. */
  weeks: { start: string; minutes: number }[]
  lastReview?: string
  /** The mentor's notes about the user. */
  notes: string[]
}

export type MentorRequest =
  | { mode: 'plan'; lang: MentorLang; context: MentorContext; date: string; note?: string }
  | { mode: 'chat'; lang: MentorLang; context: MentorContext; messages: ChatMessage[] }
  | { mode: 'brief'; lang: MentorLang; context: MentorContext; kind: BriefKind }
  | {
      mode: 'intake'
      lang: MentorLang
      about: IntakeAbout
      profile: IntakeProfile
      messages: ChatMessage[]
    }
  | {
      mode: 'coach'
      lang: MentorLang
      kind: CoachKind
      today: string
      goal: GoalContext
      /** The task the user is stuck on ("stuck"). */
      taskRef?: string
      /** The stage being checked ("check"). */
      stageId?: string
      /** Empty on the first turn: the mentor opens the session. */
      messages: ChatMessage[]
    }
  | {
      mode: 'roadmap'
      lang: MentorLang
      context: MentorContext
      profile: IntakeProfile
      /** The user's wish for another version ("fewer theory, more practice"). */
      note?: string
    }

export interface IntakeResponse {
  /** The mentor's next line: usually one question. */
  reply: string
  /** Quick answers to that question (buttons); the user may always write their own. */
  options: string[]
  /** Everything known so far, merged with the previous profile. */
  profile: IntakeProfile
  /** Enough is known to propose a plan. */
  done: boolean
}

/** A new task from a session; with parentRef it becomes a step (subtask) of that task. */
export type CoachTask = RoadmapTask & { parentRef?: string }

/** What a coaching session ends with; nothing changes until the user accepts it. */
export interface CoachProposal {
  tasks: CoachTask[]
  /** Open tasks moved to another day. */
  moves: { taskRef: string; date: string }[]
  notes: string[]
  /** The knowledge check's verdict ("check"). */
  check?: { score: number; passed: boolean; gaps: string[] }
}

export interface CoachResponse {
  reply: string
  options: string[]
  done: boolean
  proposal?: CoachProposal
}

export interface RoadmapStage {
  id: string
  title: string
  outcome: string
  weeks?: number
}

export interface RoadmapTask {
  title: string
  stageId: string
  estimateMin?: number
  plannedDate?: string
  /** What exactly to do, and with what. */
  notes?: string
}

export interface RoadmapResponse {
  title: string
  /** The approach in 2–3 sentences. */
  summary: string
  stages: RoadmapStage[]
  /** Concrete tasks for the first one or two weeks. */
  tasks: RoadmapTask[]
  /** Facts about the user worth remembering. */
  notes: string[]
}

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
      /** A new task can go straight onto the calendar: a block on plannedDate. */
      start?: string
      end?: string
    }
  | {
      type: 'schedule'
      taskRef?: string
      title?: string
      /** For a titled block (not a task): a break or an event. */
      kind?: 'break' | 'event'
      date: string
      start: string
      end: string
    }
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

export type MentorResponse =
  | PlanResponse
  | ChatResponse
  | BriefResponse
  | IntakeResponse
  | RoadmapResponse
  | CoachResponse

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
        ...(validSpan(a.plannedDate, a.start, a.end)
          ? { start: a.start as string, end: a.end as string }
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
          : {
              title: (a.title as string).trim(),
              kind: a.kind === 'break' ? ('break' as const) : ('event' as const),
            }),
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
  return { reply: (raw.reply as string).trim(), actions: joinNewTaskBlocks(actions).slice(0, 12) }
}

const sameTitle = (a: string, b: string) =>
  a.toLowerCase().replace(/ё/g, 'е').trim() === b.toLowerCase().replace(/ё/g, 'е').trim()

/**
 * A task proposed in the same answer has no ref yet, so models schedule it by title — which
 * would add an event twin next to the new task. Such a block becomes the new task's time instead.
 */
function joinNewTaskBlocks(actions: MentorAction[]): MentorAction[] {
  const out = [...actions]
  for (let i = out.length - 1; i >= 0; i--) {
    const a = out[i]!
    if (a.type !== 'schedule' || !a.title || a.kind === 'break') continue
    const j = out.findIndex(
      (x) => x.type === 'create_task' && !x.start && sameTitle(x.title, a.title!),
    )
    if (j < 0) continue
    out[j] = { ...(out[j] as CreateTask), plannedDate: a.date, start: a.start, end: a.end }
    out.splice(i, 1)
  }
  return out
}

type CreateTask = Extract<MentorAction, { type: 'create_task' }>

export function parseBrief(raw: unknown, refs: ReadonlySet<string>): BriefResponse | null {
  if (!isObj(raw) || !str(raw.text, 4000)) return null
  const focus = (Array.isArray(raw.focus) ? raw.focus : []).filter(
    (r): r is string => typeof r === 'string' && refs.has(r),
  )
  return { text: (raw.text as string).trim(), focus: focus.slice(0, 5) }
}

const PROFILE_TEXT = [
  'title',
  'subject',
  'level',
  'background',
  'motivation',
  'success',
  'schedule',
  'style',
  'constraints',
] as const

/** The well-formed part of a profile; unknown keys and odd values are dropped. */
export function cleanProfile(raw: unknown): IntakeProfile {
  if (!isObj(raw)) return {}
  const out: IntakeProfile = {}
  for (const key of PROFILE_TEXT) if (str(raw[key], 400)) out[key] = (raw[key] as string).trim()
  if (typeof raw.targetDate === 'string' && DATE.test(raw.targetDate)) out.targetDate = raw.targetDate
  const weekly = Number(raw.weeklyMinutes)
  if (Number.isFinite(weekly) && weekly >= 15 && weekly <= 6000) out.weeklyMinutes = Math.round(weekly)
  if (Array.isArray(raw.studyDays)) {
    const days = [...new Set(raw.studyDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))]
    if (days.length) out.studyDays = days.sort()
  }
  return out
}

/**
 * Keeps the earlier answers: a model that forgets a field must not erase it. A deadline that is
 * not in the future ("by summer" read as the summer just gone) is dropped.
 */
export function parseIntake(
  raw: unknown,
  previous: IntakeProfile = {},
  today?: string,
): IntakeResponse | null {
  if (!isObj(raw) || !str(raw.reply, 2000)) return null
  const profile = { ...previous, ...cleanProfile(raw.profile) }
  if (today && profile.targetDate && profile.targetDate <= today) delete profile.targetDate
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter((o): o is string => str(o, 80))
    .map((o) => o.trim())
  return {
    reply: (raw.reply as string).trim(),
    options: [...new Set(options)].slice(0, 6),
    profile,
    done: raw.done === true,
  }
}

export function parseRoadmap(raw: unknown): RoadmapResponse | null {
  if (!isObj(raw) || !str(raw.title, 120) || !Array.isArray(raw.stages)) return null
  const stages: RoadmapStage[] = []
  for (const s of raw.stages) {
    if (!isObj(s) || !str(s.title, 120) || !str(s.outcome, 400)) continue
    const id = str(s.id, 20) ? (s.id as string).trim() : `s${stages.length + 1}`
    if (stages.some((x) => x.id === id)) continue
    const weeks = Number(s.weeks)
    stages.push({
      id,
      title: (s.title as string).trim(),
      outcome: (s.outcome as string).trim(),
      ...(Number.isFinite(weeks) && weeks > 0 && weeks <= 52 ? { weeks: Math.round(weeks) } : {}),
    })
  }
  if (stages.length === 0) return null
  const ids = new Set(stages.map((s) => s.id))
  const tasks: RoadmapTask[] = []
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    if (!isObj(t) || !str(t.title, 200)) continue
    const estimate = Number(t.estimateMin)
    tasks.push({
      title: (t.title as string).trim(),
      // A task tied to an unknown stage goes to the first one rather than being lost.
      stageId: typeof t.stageId === 'string' && ids.has(t.stageId) ? t.stageId : stages[0]!.id,
      ...(Number.isFinite(estimate) && estimate >= 5 && estimate <= 600
        ? { estimateMin: Math.round(estimate) }
        : {}),
      ...(typeof t.plannedDate === 'string' && DATE.test(t.plannedDate)
        ? { plannedDate: t.plannedDate }
        : {}),
      ...(str(t.notes, 1000) ? { notes: (t.notes as string).trim() } : {}),
    })
  }
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .filter((n): n is string => str(n, 300))
    .map((n) => n.trim())
  return {
    title: (raw.title as string).trim(),
    summary: str(raw.summary, 2000) ? (raw.summary as string).trim() : '',
    stages: stages.slice(0, 8),
    tasks: tasks.slice(0, 24),
    notes: notes.slice(0, 6),
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/**
 * The valid part of a coaching answer. Tasks may only point at stages and tasks of this goal;
 * a proposal counts only once the session is done.
 */
export function parseCoach(
  raw: unknown,
  goal: GoalContext,
  session: { kind: CoachKind; taskRef?: string } = { kind: 'review' },
): CoachResponse | null {
  if (!isObj(raw) || !str(raw.reply, 4000)) return null
  // A check never offers quick answers: they would give the answer away.
  const options = (session.kind === 'check' ? [] : Array.isArray(raw.options) ? raw.options : [])
    .filter((o): o is string => str(o, 80))
    .map((o) => o.trim())
  const done = raw.done === true
  const out: CoachResponse = { reply: (raw.reply as string).trim(), options: [...new Set(options)].slice(0, 6), done }
  const p = raw.proposal
  if (!done || !isObj(p)) return out

  const stages = new Set(goal.stages.map((s) => s.id))
  const refs = new Map(goal.tasks.map((t) => [t.ref, t]))
  const fallbackStage = goal.stages.find((s) => s.status === 'active')?.id ?? goal.stages[0]?.id ?? 's1'
  const tasks: CoachTask[] = []
  for (const t of Array.isArray(p.tasks) ? p.tasks : []) {
    if (!isObj(t) || !str(t.title, 200)) continue
    const estimate = Number(t.estimateMin)
    // Steps belong to the task a "stuck" session is about; elsewhere new tasks stand on their own.
    const parent =
      session.kind !== 'stuck'
        ? undefined
        : typeof t.parentRef === 'string' && refs.has(t.parentRef)
          ? t.parentRef
          : session.taskRef && refs.has(session.taskRef)
            ? session.taskRef
            : undefined
    tasks.push({
      title: (t.title as string).trim(),
      stageId: typeof t.stageId === 'string' && stages.has(t.stageId) ? t.stageId : fallbackStage,
      ...(Number.isFinite(estimate) && estimate >= 5 && estimate <= 600 ? { estimateMin: Math.round(estimate) } : {}),
      ...(typeof t.plannedDate === 'string' && DATE.test(t.plannedDate) ? { plannedDate: t.plannedDate } : {}),
      ...(str(t.notes, 1000) ? { notes: (t.notes as string).trim() } : {}),
      ...(parent ? { parentRef: parent } : {}),
    })
  }
  const moves = (Array.isArray(p.moves) ? p.moves : []).flatMap((m) =>
    isObj(m) &&
    typeof m.taskRef === 'string' &&
    refs.get(m.taskRef)?.status === 'open' &&
    typeof m.date === 'string' &&
    DATE.test(m.date)
      ? [{ taskRef: m.taskRef, date: m.date }]
      : [],
  )
  const notes = (Array.isArray(p.notes) ? p.notes : [])
    .filter((n): n is string => str(n, 300))
    .map((n) => n.trim())
  const c = p.check
  const score = isObj(c) ? Number(c.score) : NaN
  out.proposal = {
    tasks: tasks.slice(0, 16),
    moves: moves.slice(0, 16),
    notes: notes.slice(0, 5),
    ...(session.kind === 'check' && isObj(c) && Number.isFinite(score)
      ? {
          check: {
            score: clamp01(score > 1 ? score / 100 : score),
            passed: c.passed === true,
            gaps: (Array.isArray(c.gaps) ? c.gaps : []).filter((g): g is string => str(g, 200)).slice(0, 6),
          },
        }
      : {}),
  }
  return out
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

/** A conversation that ends with the user's turn, or null. */
function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null
  const messages = raw.filter(
    (m): m is ChatMessage =>
      isObj(m) && (m.role === 'user' || m.role === 'assistant') && str(m.content, 8000),
  )
  return messages.length > 0 && messages[messages.length - 1]!.role === 'user' ? messages : null
}

/** Structural check of an incoming request (server side). Bounded sizes keep prompts cheap. */
export function parseRequest(raw: unknown): MentorRequest | null {
  if (!isObj(raw) || (raw.lang !== 'ru' && raw.lang !== 'en')) return null
  if (raw.mode === 'intake') {
    const about = raw.about
    const messages = parseMessages(raw.messages)
    if (
      !messages ||
      !isObj(about) ||
      !str(about.today, 20) ||
      !isObj(about.workHours) ||
      (about.goals !== undefined && !Array.isArray(about.goals))
    ) {
      return null
    }
    return {
      mode: 'intake',
      lang: raw.lang,
      about: {
        today: about.today as string,
        weekday: str(about.weekday, 20) ? (about.weekday as string) : '',
        workHours: about.workHours as IntakeAbout['workHours'],
        avgTrackedMin: Number(about.avgTrackedMin) || 0,
        activeDays: Number(about.activeDays) || 0,
        goals: ((about.goals as unknown[] | undefined) ?? []).filter((g): g is string => str(g, 200)).slice(0, 20),
      },
      profile: cleanProfile(raw.profile),
      messages,
    }
  }
  if (raw.mode === 'coach') {
    const goal = raw.goal
    const kinds: CoachKind[] = ['review', 'stuck', 'check']
    // The mentor opens a session, so an empty conversation is fine here.
    const messages = Array.isArray(raw.messages) && raw.messages.length === 0 ? [] : parseMessages(raw.messages)
    if (
      !messages ||
      !kinds.includes(raw.kind as CoachKind) ||
      !str(raw.today, 20) ||
      !isObj(goal) ||
      !str(goal.title, 200) ||
      !Array.isArray(goal.stages) ||
      goal.stages.length === 0 ||
      goal.stages.length > 12 ||
      !Array.isArray(goal.tasks) ||
      goal.tasks.length > 120 ||
      !Array.isArray(goal.weeks) ||
      !Array.isArray(goal.notes)
    ) {
      return null
    }
    return {
      mode: 'coach',
      lang: raw.lang,
      kind: raw.kind as CoachKind,
      today: raw.today as string,
      goal: { ...(goal as unknown as GoalContext), profile: cleanProfile(goal.profile) },
      ...(str(raw.taskRef, 10) ? { taskRef: raw.taskRef as string } : {}),
      ...(str(raw.stageId, 20) ? { stageId: raw.stageId as string } : {}),
      messages,
    }
  }
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
  if (raw.mode === 'chat') {
    const messages = parseMessages(raw.messages)
    return messages ? { mode: 'chat', lang: raw.lang, context, messages } : null
  }
  if (raw.mode === 'roadmap' && optStr(raw.note, 500)) {
    const profile = cleanProfile(raw.profile)
    if (!profile.subject) return null
    return {
      mode: 'roadmap',
      lang: raw.lang,
      context,
      profile,
      ...(str(raw.note, 500) ? { note: raw.note as string } : {}),
    }
  }
  if (raw.mode === 'brief' && (raw.kind === 'morning' || raw.kind === 'evening')) {
    return { mode: 'brief', lang: raw.lang, context, kind: raw.kind }
  }
  return null
}
