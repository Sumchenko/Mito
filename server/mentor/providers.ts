import type { MentorRequest } from '../../src/mentor/protocol.ts'
import type { ProviderConfig } from './config.ts'
import { mockRespond } from './mock.ts'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Provider {
  name: string
  /** Returns the model's text (expected to be JSON). Throws ProviderError on failure. */
  complete(messages: LlmMessage[], request: MentorRequest): Promise<string>
}

export class ProviderError extends Error {
  status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ProviderError'
    this.status = status
  }
}

const TIMEOUT_MS = 45_000

/** Any OpenAI-compatible chat-completions endpoint: Gemini, Groq, OpenRouter, Ollama… */
export function openAICompatible(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): Provider {
  return {
    name: cfg.name,
    async complete(messages) {
      let res: Response
      try {
        res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: 0.4,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (e) {
        throw new ProviderError(`${cfg.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300)
        throw new ProviderError(`${cfg.name}: HTTP ${res.status} ${detail}`, res.status)
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = body.choices?.[0]?.message?.content
      if (!content) throw new ProviderError(`${cfg.name}: empty answer`)
      return content
    },
  }
}

/** Development stand-in: deterministic answers computed from the request, no network. */
export const mockProvider: Provider = {
  name: 'mock',
  complete: async (_messages, request) => JSON.stringify(mockRespond(request)),
}

export const makeProviders = (configs: ProviderConfig[]) =>
  configs.map((c) => (c.name === 'mock' ? mockProvider : openAICompatible(c)))
