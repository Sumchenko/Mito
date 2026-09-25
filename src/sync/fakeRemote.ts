import type { Change, Remote, RemoteRow } from './engine'

/**
 * In-memory stand-in for the server with the same rules as `push_records`: last write wins
 * on `updatedAt`, and every accepted write gets the next revision.
 */
export function fakeRemote() {
  const rows = new Map<string, RemoteRow>()
  let rev = 0
  const remote: Remote & { rows: Map<string, RemoteRow>; pushes: number } = {
    rows,
    pushes: 0,
    async push(changes: Change[]) {
      remote.pushes++
      for (const c of changes) {
        const existing = rows.get(c.id)
        if (existing && existing.updatedAt >= c.updatedAt) continue
        rows.set(c.id, { ...structuredClone(c), rev: ++rev })
      }
    },
    async pull(since: number, limit: number) {
      return [...rows.values()]
        .filter((r) => r.rev > since)
        .sort((a, b) => a.rev - b.rev)
        .slice(0, limit)
        .map((r) => structuredClone(r))
    },
  }
  return remote
}
