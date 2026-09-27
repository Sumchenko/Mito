import { db } from '../db'
import { DomainError } from '../errors'
import { alive, created, definedOnly } from '../meta'
import type { Id, MentorNote } from '../types'
import { requireAlive, requireName } from './common'

/** Notes are short facts, not transcripts: they go into every mentor request. */
export const NOTE_MAX_LENGTH = 300

function requireText(text: string) {
  const value = requireName(text, 'Note')
  if (value.length > NOTE_MAX_LENGTH) {
    throw new DomainError('invalid', `A note is at most ${NOTE_MAX_LENGTH} characters`)
  }
  return value
}

export const mentorNotesRepo = {
  /** Newest first. With a goal: that goal's notes and the general ones. */
  async list(goalId?: Id): Promise<MentorNote[]> {
    const all = (await db.mentorNotes.toArray()).filter(alive)
    return all
      .filter((n) => goalId === undefined || !n.goalId || n.goalId === goalId)
      .sort((a, b) => b.createdAt - a.createdAt)
  },

  async add(input: { text: string; source: MentorNote['source']; goalId?: Id }): Promise<MentorNote> {
    const note: MentorNote = {
      ...created(),
      text: requireText(input.text),
      source: input.source,
      goalId: input.goalId,
    }
    await db.mentorNotes.add(definedOnly(note) as MentorNote)
    return note
  },

  async update(id: Id, text: string) {
    const value = requireText(text)
    await db.transaction('rw', db.mentorNotes, async () => {
      await requireAlive(db.mentorNotes, id, 'Note')
      await db.mentorNotes.update(id, { text: value, updatedAt: Date.now() })
    })
  },

  async remove(id: Id) {
    await db.transaction('rw', db.mentorNotes, async () => {
      await requireAlive(db.mentorNotes, id, 'Note')
      const now = Date.now()
      await db.mentorNotes.update(id, { deletedAt: now, updatedAt: now })
    })
  },
}
