import type { Id } from './types'

let lastMs = 0
let seq = 0

/**
 * UUIDv7 (RFC 9562): 48-bit millisecond timestamp followed by random bits. IDs sort by
 * creation time and are safe to generate on any device without coordination. A 12-bit
 * counter keeps IDs created within the same millisecond strictly increasing.
 */
export function newId(now = Date.now()): Id {
  if (now <= lastMs) {
    seq = (seq + 1) & 0xfff
    if (seq === 0) lastMs += 1 // counter overflow: borrow the next millisecond
    now = lastMs
  } else {
    lastMs = now
    seq = 0
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  const ms = BigInt(now)
  for (let i = 0; i < 6; i++) bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
  bytes[6] = 0x70 | (seq >> 8) // version 7 + counter high bits
  bytes[7] = seq & 0xff
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
