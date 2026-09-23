import { useEffect } from 'react'
import i18n from '@/i18n'
import { useSettings } from './settings'

/** Keeps <html data-theme> and the i18n language in sync with user settings. */
export function useApplySettings() {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  const style = useSettings((s) => s.style)

  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.style = style
  }, [style])

  useEffect(() => {
    void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [language])
}
