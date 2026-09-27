/** Mentor server settings, all from the environment (see docs/DEPLOY.md). */
export interface Config {
  port: number
  /** SQLite file for rate-limit counters. */
  dbPath: string
  /** Salt for hashing client IPs: counters never store an address. */
  salt: string
  production: boolean
  providers: ProviderConfig[]
  limits: Limits
  /** Model calls running at once; more requests are turned away as "busy". */
  maxConcurrent: number
}

export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
}

export interface Limits {
  perIpDay: number
  perIpMinute: number
  /** All clients together: protects the free quota of the model providers. */
  globalDay: number
}

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * Providers in order of preference, only those with a key. Groq first: fastest and the best plans
 * in our tests, but only ~8k tokens a minute (about two requests). Then Gemini Flash, which the
 * free tier often turns away with "high demand", then Gemini Flash-Lite: its own quota, rarely
 * overloaded. All speak the OpenAI chat-completions protocol, so adding another is one entry here.
 */
export function loadConfig(env: Record<string, string | undefined>): Config {
  const all: (ProviderConfig & { key?: string })[] = [
    {
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: env.MENTOR_GEMINI_KEY ?? '',
      // The alias follows the current stable Flash: pinned versions get retired for new keys.
      model: env.MENTOR_GEMINI_MODEL || 'gemini-flash-latest',
    },
    {
      name: 'gemini-lite',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: env.MENTOR_GEMINI_KEY ?? '',
      model: env.MENTOR_GEMINI_LITE_MODEL || 'gemini-flash-lite-latest',
    },
    {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: env.MENTOR_GROQ_KEY ?? '',
      model: env.MENTOR_GROQ_MODEL || 'openai/gpt-oss-120b',
    },
  ]
  const order = (env.MENTOR_PROVIDERS || 'groq,gemini,gemini-lite').split(',').map((s) => s.trim())
  const production = env.NODE_ENV === 'production'
  const providers = order.flatMap((name) => {
    if (name === 'mock')
      return production ? [] : [{ name: 'mock', baseUrl: '', apiKey: '', model: 'mock' }]
    const p = all.find((x) => x.name === name)
    return p && p.apiKey ? [p] : []
  })
  // Without any key in development, answer with the built-in mock so the app stays testable.
  if (providers.length === 0 && !production)
    providers.push({ name: 'mock', baseUrl: '', apiKey: '', model: 'mock' })

  return {
    port: int(env.MENTOR_PORT, 8787),
    dbPath: env.MENTOR_DB || '.mentor/limits.db',
    salt: env.MENTOR_SALT || 'mito-dev-salt',
    production,
    providers,
    limits: {
      perIpDay: int(env.MENTOR_IP_DAY, 30),
      perIpMinute: int(env.MENTOR_IP_MINUTE, 6),
      globalDay: int(env.MENTOR_GLOBAL_DAY, 800),
    },
    maxConcurrent: int(env.MENTOR_MAX_CONCURRENT, 4),
  }
}
