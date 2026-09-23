import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { startOfLocalDate, type LocalDate } from '@/data'

const MIN = 60_000

/** Formatters for the statistics page, bound to the current language. */
export function useStatsFormat() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  return useMemo(() => {
    const h = t('common.h')
    const m = lang === 'ru' ? 'м' : 'm'
    const percent = new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 })
    const ratio = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 })
    const dayMonth = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long' })
    const dayShort = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' })
    const weekdayLong = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' })
    const monthShort = new Intl.DateTimeFormat(lang, { month: 'short' })
    const date = (d: LocalDate) => new Date(startOfLocalDate(d))

    return {
      /** "3ч 20м", "45м", "0м". */
      duration(ms: number) {
        const total = Math.round(ms / MIN)
        const hh = Math.floor(total / 60)
        const mm = total % 60
        if (hh && mm) return `${hh}${h} ${mm}${m}`
        return hh ? `${hh}${h}` : `${mm}${m}`
      },
      /** Axis labels: whole hours, or minutes below an hour. */
      tick(ms: number) {
        return ms >= 60 * MIN ? `${Math.round((ms / (60 * MIN)) * 10) / 10}${h}` : `${Math.round(ms / MIN)}${m}`
      },
      percent: (r: number) => percent.format(r),
      /** "×1,4" */
      times: (r: number) => `×${ratio.format(r)}`,
      /** Relative change against the previous period, or null when there is nothing to compare. */
      delta(current: number, previous: number) {
        if (previous <= 0) return null
        const change = current / previous - 1
        if (Math.abs(change) < 0.005) return { text: '±0%', dir: 0 as const }
        return { text: `${change > 0 ? '+' : '−'}${percent.format(Math.abs(change))}`, dir: (change > 0 ? 1 : -1) as 1 | -1 }
      },
      dayMonth: (d: LocalDate) => dayMonth.format(date(d)),
      dayShort: (d: LocalDate) => dayShort.format(date(d)),
      weekdayLong: (d: LocalDate) => weekdayLong.format(date(d)),
      monthShort: (d: LocalDate) => monthShort.format(date(d)).replace('.', ''),
      lang,
    }
  }, [t, lang])
}

export type StatsFormat = ReturnType<typeof useStatsFormat>
