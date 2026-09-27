import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Limits } from './config.ts'

export type Verdict =
  | { ok: true; remaining: number }
  | { ok: false; retryAfter: number; scope: 'minute' | 'day' | 'global' }

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)
const secondsToUtcMidnight = (at: number) => {
  const next = new Date(at)
  next.setUTCHours(24, 0, 0, 0)
  return Math.ceil((next.getTime() - at) / 1000)
}

/**
 * Request limits per client IP and in total. Daily counters live in SQLite so a restart or a
 * deploy does not hand out a fresh quota; the per-minute burst window is kept in memory.
 * IPs are stored only as salted hashes.
 */
export function createLimiter(path: string, limits: Limits, salt: string, now = () => Date.now()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(
    'create table if not exists daily (key text not null, day text not null, count integer not null, primary key (key, day))',
  )
  const get = db.prepare('select count from daily where key = ? and day = ?')
  const bump = db.prepare(
    'insert into daily (key, day, count) values (?, ?, ?) on conflict (key, day) do update set count = count + excluded.count',
  )
  const prune = db.prepare('delete from daily where day < ?')
  const recent = new Map<string, number[]>()

  const hash = (ip: string) =>
    createHash('sha256')
      .update(salt + ip)
      .digest('hex')
      .slice(0, 32)
  const countOf = (key: string, day: string) =>
    Number((get.get(key, day) as { count?: number } | undefined)?.count ?? 0)

  return {
    /** Counts a request if it is allowed. */
    take(ip: string): Verdict {
      const at = now()
      const day = utcDay(at)
      const key = hash(ip)

      const window = (recent.get(key) ?? []).filter((t) => at - t < 60_000)
      if (window.length >= limits.perIpMinute) {
        return {
          ok: false,
          scope: 'minute',
          retryAfter: Math.ceil((60_000 - (at - window[0]!)) / 1000),
        }
      }
      if (countOf('*', day) >= limits.globalDay)
        return { ok: false, scope: 'global', retryAfter: secondsToUtcMidnight(at) }
      const used = countOf(key, day)
      if (used >= limits.perIpDay)
        return { ok: false, scope: 'day', retryAfter: secondsToUtcMidnight(at) }

      window.push(at)
      recent.set(key, window)
      bump.run(key, day, 1)
      bump.run('*', day, 1)
      return { ok: true, remaining: limits.perIpDay - used - 1 }
    },
    /** Gives a request back when it failed on our side (all providers down). */
    refund(ip: string) {
      const day = utcDay(now())
      bump.run(hash(ip), day, -1)
      bump.run('*', day, -1)
    },
    /** Drops counters older than a week; called now and then. */
    prune() {
      prune.run(utcDay(now() - 7 * 86_400_000))
      for (const [key, times] of recent)
        if (times.every((t) => now() - t >= 60_000)) recent.delete(key)
    },
    close: () => db.close(),
  }
}

export type Limiter = ReturnType<typeof createLimiter>
