import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage, IntakeProfile, RoadmapResponse } from '@/mentor/protocol'

/** talk → confirm ("did I get it right?") → plan (the roadmap preview) → a goal. */
export type IntakePhase = 'talk' | 'confirm' | 'plan'

interface IntakeState {
  active: boolean
  phase: IntakePhase
  /** Starts with the mentor's opening question. */
  messages: ChatMessage[]
  /** Quick answers to the mentor's last question. */
  options: string[]
  profile: IntakeProfile
  roadmap?: RoadmapResponse
  /** Which of the roadmap's first tasks the user keeps. */
  picked: boolean[]
}

const idle: IntakeState = {
  active: false,
  phase: 'talk',
  messages: [],
  options: [],
  profile: {},
  picked: [],
}

/**
 * The goal being set up. Kept on this device across reloads — a half-finished conversation is
 * not data worth syncing, but losing it to a refresh would be annoying.
 */
export const useIntake = create<IntakeState>()(
  persist((): IntakeState => idle, { name: 'mito.intake', version: 1 }),
)

/** Opens the intake; with a first answer the conversation starts right away. */
export const startIntake = (opening: string, first?: string) =>
  useIntake.setState({
    ...idle,
    active: true,
    messages: [
      { role: 'assistant', content: opening },
      ...(first?.trim() ? [{ role: 'user' as const, content: first.trim() }] : []),
    ],
  })

export const addIntakeMessage = (message: ChatMessage) =>
  useIntake.setState((s) => ({ messages: [...s.messages, message], options: [] }))

export const setIntake = (patch: Partial<IntakeState>) => useIntake.setState(patch)

/** Puts the intake away; it can be resumed later from where it stopped. */
export const pauseIntake = () => useIntake.setState({ active: false })

export const resetIntake = () => useIntake.setState(idle)
