import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from '@/i18n'

export type ThemePreference = 'system' | 'light' | 'dark'
/** Visual style: 'airy' — bright, illustrated; 'strict' — restrained Windows 11 neutral. */
export type StylePreference = 'airy' | 'strict'

interface SettingsState {
  theme: ThemePreference
  style: StylePreference
  language: Language
  navCollapsed: boolean
  setTheme: (theme: ThemePreference) => void
  setStyle: (style: StylePreference) => void
  setLanguage: (language: Language) => void
  toggleNav: () => void
}

/** UI preferences only. Domain data (tasks, time entries) lives in IndexedDB from stage 1. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      style: 'airy',
      language: 'ru',
      navCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setStyle: (style) => set({ style }),
      setLanguage: (language) => set({ language }),
      toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
    }),
    { name: 'mito.settings', version: 1 },
  ),
)
