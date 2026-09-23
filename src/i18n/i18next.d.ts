import 'i18next'
import type { ru } from './ru'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof ru }
  }
}
