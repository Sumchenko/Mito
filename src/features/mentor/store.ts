import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { newId } from '@/data/ids'
import type { StoredRefs } from '@/mentor/apply'
import type { BriefKind, MentorAction } from '@/mentor/protocol'

export interface ProposedAction {
  action: MentorAction
  /** Human description fixed when the answer arrived (refs mean nothing later). */
  label: string
  state: 'pending' | 'applied' | 'dismissed' | 'failed'
}

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  actions?: ProposedAction[]
  /** The refs the answer's actions point into. */
  refs?: StoredRefs
}

export interface StoredBrief {
  text: string
  /** Titles of the tasks to focus on, resolved when the brief arrived. */
  focus: string[]
  at: number
}

interface MentorState {
  messages: StoredMessage[]
  /** Keyed "2026-09-27:morning": one brief per day and kind unless refreshed. */
  briefs: Record<string, StoredBrief>
}

const KEEP_MESSAGES = 60

/** The conversation and briefs live on this device only: they are a scratchpad, not data. */
export const useMentor = create<MentorState>()(
  persist((): MentorState => ({ messages: [], briefs: {} }), { name: 'mito.mentor', version: 1 }),
)

/** Appends a message, stamping its id and time. */
export const addMessage = (m: Omit<StoredMessage, 'id' | 'at'>) => {
  const message: StoredMessage = { ...m, id: newId(), at: Date.now() }
  useMentor.setState((s) => ({ messages: [...s.messages, message].slice(-KEEP_MESSAGES) }))
  return message
}

export const setActionState = (messageId: string, index: number, state: ProposedAction['state']) =>
  useMentor.setState((s) => ({
    messages: s.messages.map((m) =>
      m.id === messageId && m.actions
        ? { ...m, actions: m.actions.map((a, i) => (i === index ? { ...a, state } : a)) }
        : m,
    ),
  }))

export const clearChat = () => useMentor.setState({ messages: [] })

export const saveBrief = (key: string, brief: StoredBrief) =>
  useMentor.setState((s) => {
    // Keep a week of briefs at most.
    const kept = Object.entries(s.briefs).filter(([, b]) => Date.now() - b.at < 7 * 86_400_000)
    return { briefs: { ...Object.fromEntries(kept), [key]: brief } }
  })

/** Morning until 4 pm, the day's review after. */
export const briefKindAt = (hour: number): BriefKind => (hour < 16 ? 'morning' : 'evening')
