import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Id } from '@/data'
import type { ChatMessage, CoachKind, CoachProposal } from '@/mentor/protocol'

export interface CoachSession {
  goalId: Id
  kind: CoachKind
  /** The task a "stuck" session is about. */
  taskId?: Id
  /** The stage a check is about. */
  stageId?: string
  messages: ChatMessage[]
  options: string[]
  done: boolean
  proposal?: CoachProposal
  /** Refs of the context the proposal was made against. */
  refs: [string, Id][]
  picked: boolean[]
}

/**
 * The coaching session in progress, one at a time. Kept on this device across reloads, like the
 * intake: an unfinished conversation is a scratchpad, not data to sync.
 */
export const useCoach = create<{ session: CoachSession | null }>()(
  persist(() => ({ session: null as CoachSession | null }), { name: 'mito.coach', version: 1 }),
)

export const startSession = (s: Pick<CoachSession, 'goalId' | 'kind' | 'taskId' | 'stageId'>) =>
  useCoach.setState({
    session: { ...s, messages: [], options: [], done: false, refs: [], picked: [] },
  })

export const updateSession = (patch: Partial<CoachSession>) =>
  useCoach.setState((st) => (st.session ? { session: { ...st.session, ...patch } } : st))

export const endSession = () => useCoach.setState({ session: null })
