import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '@/i18n'

export type ThemePreference = 'system' | 'light' | 'dark'
/** Visual style: 'airy' — bright, illustrated; 'strict' — restrained Windows 11 neutral. */
export type StylePreference = 'airy' | 'strict'
/**
 * What the AI is for this user: 'mentor' leads them to learning goals, 'assistant' only helps
 * plan their days. `null` until they choose on the welcome screen.
 */
export type AiMode = 'mentor' | 'assistant'

interface SettingsState {
  theme: ThemePreference
  style: StylePreference
  language: Language
  navCollapsed: boolean
  aiMode: AiMode | null
  setTheme: (theme: ThemePreference) => void
  setStyle: (style: StylePreference) => void
  setLanguage: (language: Language) => void
  toggleNav: () => void
  setAiMode: (mode: AiMode) => void
}

/** UI preferences only. Domain data (tasks, time entries) lives in IndexedDB from stage 1. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      style: 'airy',
      language: 'ru',
      navCollapsed: false,
      aiMode: null,
      setTheme: (theme) => set({ theme }),
      setStyle: (style) => set({ style }),
      setLanguage: (language) => set({ language }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setAiMode: (aiMode) => set({ aiMode }),
    }),
    { name: 'mito.settings', version: 1 },
  ),
)
