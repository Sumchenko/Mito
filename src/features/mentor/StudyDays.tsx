import { useTranslation } from 'react-i18next'
import { weekdayNames } from './text'
import s from './StudyDays.module.css'

/**
 * The weekdays a user studies on, as toggles. None selected means any day; the app moves planned
 * days onto these, so the mentor never schedules on a day off.
 */
export function StudyDays({
  value,
  onChange,
  label,
}: {
  value: readonly number[] | undefined
  onChange: (days: number[]) => void
  label: string
}) {
  const { i18n } = useTranslation()
  const names = weekdayNames(i18n.language)
  const on = new Set(value ?? [])
  return (
    <div className={s.days} role="group" aria-label={label}>
      {names.map((name, day) => (
        <button
          key={day}
          type="button"
          className={s.day}
          aria-pressed={on.has(day)}
          onClick={() =>
            onChange(on.has(day) ? [...on].filter((d) => d !== day) : [...on, day].sort())
          }
        >
          {name}
        </button>
      ))}
    </div>
  )
}
