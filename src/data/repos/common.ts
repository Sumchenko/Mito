import type { Table } from 'dexie'
import { DomainError } from '../errors'
import { alive } from '../meta'
import type { Id, SyncMeta, TintKey } from '../types'

export async function requireAlive<T extends SyncMeta, TInsert>(
  table: Table<T, Id, TInsert>,
  id: Id,
  what: string,
): Promise<T> {
  const record = await table.get(id)
  if (!alive(record)) throw new DomainError('not_found', `${what} ${id} not found`)
  return record
}

export function requireName(value: string, what: string): string {
  const name = value.trim()
  if (!name) throw new DomainError('invalid', `${what} must not be empty`)
  return name
}

const tints: readonly TintKey[] = ['blue', 'green', 'violet', 'orange', 'rose', 'teal']

export function requireTint(value: TintKey): TintKey {
  if (!tints.includes(value)) throw new DomainError('invalid', `Unknown color ${value}`)
  return value
}

/** Picks a color for a new item, cycling through the palette. */
export const tintAt = (index: number): TintKey => tints[index % tints.length]!

/** Gap between sibling `order` values; leaves room to insert between items without renumbering. */
export const ORDER_STEP = 1024
