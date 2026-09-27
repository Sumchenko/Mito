import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { parseRequest, type MentorError } from '../../src/mentor/protocol.ts'
import { loadConfig } from './config.ts'
import { createLimiter } from './limits.ts'
import { MentorFailure, runMentor } from './mentor.ts'
import { makeProviders } from './providers.ts'

/*
 * Mito mentor server. Listens on localhost only; Caddy forwards /api/mentor to it and sets
 * X-Real-IP from the actual connection, so the client IP used for limits cannot be spoofed.
 * Run: node server/mentor/main.ts (Node 24 runs the TypeScript directly).
 */

const MAX_BODY = 128 * 1024

const config = loadConfig(process.env)
const limiter = createLimiter(config.dbPath, config.limits, config.salt)
const providers = makeProviders(config.providers)
let running = 0

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`)

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(JSON.stringify(body))
}
const fail = (
  res: ServerResponse,
  status: number,
  error: MentorError,
  headers?: Record<string, string>,
) => send(res, status, error, headers)

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const clientIp = (req: IncomingMessage) => {
  const real = req.headers['x-real-ip']
  return (Array.isArray(real) ? real[0] : real) || req.socket.remoteAddress || 'unknown'
}

const server = createServer(async (req, res) => {
  const path = (req.url ?? '').split('?')[0]
  if (req.method === 'GET' && path === '/api/mentor/health') {
    return send(res, 200, { ok: true, providers: providers.map((p) => p.name) })
  }
  if (path !== '/api/mentor') return send(res, 404, { error: 'not_found' })
  if (req.method !== 'POST')
    return send(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })
  if (providers.length === 0) return fail(res, 503, { error: 'unavailable' })

  const body = await readBody(req)
  let parsed: unknown
  try {
    parsed = body === null ? undefined : JSON.parse(body)
  } catch {
    parsed = undefined
  }
  const request = parseRequest(parsed)
  if (!request) return fail(res, 400, { error: 'bad_request' })

  if (running >= config.maxConcurrent)
    return fail(res, 503, { error: 'busy', retryAfter: 5 }, { 'retry-after': '5' })
  const ip = clientIp(req)
  const verdict = limiter.take(ip)
  if (!verdict.ok) {
    return fail(
      res,
      429,
      { error: 'rate_limited', retryAfter: verdict.retryAfter },
      { 'retry-after': String(verdict.retryAfter) },
    )
  }

  running++
  const started = Date.now()
  try {
    const { response, provider } = await runMentor(request, providers, log)
    log(`${request.mode} via ${provider} in ${Date.now() - started}ms`)
    send(res, 200, response, {
      'x-ratelimit-remaining': String(verdict.remaining),
      'x-mentor-provider': provider,
    })
  } catch (e) {
    // Our failure, not the user's: the request does not count against them.
    limiter.refund(ip)
    log(`${request.mode} failed: ${e instanceof Error ? e.message : String(e)}`)
    fail(res, 503, { error: e instanceof MentorFailure ? 'unavailable' : 'failed' })
  } finally {
    running--
  }
})

setInterval(() => limiter.prune(), 6 * 3_600_000).unref()
server.listen(config.port, '127.0.0.1', () => {
  log(
    `mentor listening on 127.0.0.1:${config.port} with ${providers.map((p) => `${p.name}`).join(' → ') || 'no providers'}`,
  )
})

const stop = () => {
  server.close()
  limiter.close()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
