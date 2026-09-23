import { addDays, startOfLocalDate, type LocalDate } from '@/data'

type Translate = (key: 'common.today' | 'common.tomorrow' | 'common.yesterday') => string

/**
 * Human label for a calendar day relative to today: "Сегодня", "Завтра", weekday within the
 * coming week, otherwise "25 сент." (with the year only when it differs).
 */
export function formatDay(day: LocalDate, today: LocalDate, lang: string, t: Translate) {
  if (day === today) return t('common.today')
  if (day === addDays(today, 1)) return t('common.tomorrow')
  if (day === addDays(today, -1)) return t('common.yesterday')
  const date = new Date(startOfLocalDate(day))
  if (day > today && day <= addDays(today, 6)) {
    return capitalize(new Intl.DateTimeFormat(lang, { weekday: 'long' }).format(date))
  }
  const sameYear = day.slice(0, 4) === today.slice(0, 4)
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

/** "1ч 30мин" / "1h 30min". */
export function formatMinutes(total: number, units: { h: string; min: string }) {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h && m) return `${h}${units.h} ${m}${units.min}`
  return h ? `${h}${units.h}` : `${m}${units.min}`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
