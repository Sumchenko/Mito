import {
  contextRefs,
  parseBrief,
  parseChat,
  parseCoach,
  parseIntake,
  parsePlan,
  parseRoadmap,
  type MentorRequest,
  type MentorResponse,
} from '../../src/mentor/protocol.ts'
import { buildMessages, RETRY_MESSAGE } from './prompts.ts'
import type { Provider } from './providers.ts'

/** Pulls the JSON object out of a model answer, tolerating code fences or stray prose. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

export class MentorFailure extends Error {
  constructor() {
    super('No provider produced a valid answer')
    this.name = 'MentorFailure'
  }
}

type Log = (msg: string) => void

/** A weak model sometimes answers with the user's own words: that is no answer at all. */
function echoes(response: object, req: MentorRequest) {
  if (!('reply' in response) || !('messages' in req)) return false
  const last = [...req.messages].reverse().find((m) => m.role === 'user')?.content.trim()
  return !!last && (response.reply as string).trim() === last
}

/**
 * Asks the providers in order. A provider that errors (rate limit, outage, timeout) hands over to
 * the next; one that answers in the wrong shape gets one more chance before handing over.
 */
export async function runMentor(
  req: MentorRequest,
  providers: Provider[],
  log: Log = () => {},
): Promise<{ response: MentorResponse; provider: string }> {
  const parse = (raw: unknown) => {
    switch (req.mode) {
      case 'intake':
        return parseIntake(raw, req.profile, req.about.today)
      case 'roadmap':
        return parseRoadmap(raw)
      case 'coach':
        return parseCoach(raw, req.goal, { kind: req.kind, ...(req.taskRef ? { taskRef: req.taskRef } : {}) })
      case 'plan':
        return parsePlan(raw, contextRefs(req.context))
      case 'chat':
        return parseChat(raw, contextRefs(req.context))
      case 'brief':
        return parseBrief(raw, contextRefs(req.context))
    }
  }

  for (const provider of providers) {
    const messages = buildMessages(req)
    for (let attempt = 0; attempt < 2; attempt++) {
      let text: string
      try {
        text = await provider.complete(messages, req)
      } catch (e) {
        log(`${provider.name} failed: ${e instanceof Error ? e.message : String(e)}`)
        break
      }
      const parsed = parse(extractJson(text))
      if (parsed && !echoes(parsed, req)) return { response: parsed, provider: provider.name }
      log(`${provider.name} answered in the wrong shape (attempt ${attempt + 1})`)
      messages.push({ role: 'assistant', content: text.slice(0, 4000) }, RETRY_MESSAGE)
    }
  }
  throw new MentorFailure()
}
