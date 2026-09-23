import { ChevronLeft20Regular, ChevronRight20Regular } from '@fluentui/react-icons'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { customPeriod, periodOf, shiftPeriod, type Period, type PeriodKind } from '@/analytics'
import { addDays, isLocalDate, type LocalDate } from '@/data'
import { Button } from '@/ui/Button'
import { Popover } from '@/ui/Popover'
import { Segmented } from '@/ui/Segmented'
import type { StatsFormat } from './format'
import f from '@/ui/fields.module.css'
import s from './stats.module.css'

const KINDS: PeriodKind[] = ['week', 'month', 'year', 'custom']
const POPOVER_W = 300

function periodTitle(p: Period, fmt: StatsFormat) {
  const year = p.from.slice(0, 4)
  switch (p.kind) {
    case 'year':
      return year
    case 'month': {
      const d = new Date(`${p.from}T12:00`)
      const name = new Intl.DateTimeFormat(fmt.lang, { month: 'long', year: 'numeric' }).format(d)
      return name.charAt(0).toUpperCase() + name.slice(1)
    }
    default: {
      const sameYear = year === p.to.slice(0, 4)
      const sameMonth = sameYear && p.from.slice(5, 7) === p.to.slice(5, 7)
      const from = sameMonth
        ? String(Number(p.from.slice(8)))
        : sameYear
          ? fmt.dayMonth(p.from)
          : `${fmt.dayMonth(p.from)} ${year}`
      return `${from} – ${fmt.dayMonth(p.to)} ${p.to.slice(0, 4)}`
    }
  }
}

interface PeriodBarProps {
  period: Period
  today: LocalDate
  onChange: (p: Period) => void
  fmt: StatsFormat
}

/** Period kind, previous/next, and a custom range flyout. */
export function PeriodBar({ period, today, onChange, fmt }: PeriodBarProps) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [rangeAt, setRangeAt] = useState<DOMRect | null>(null)
  const isCurrent = period.from <= today && today <= period.to

  const openRange = () => {
    const r = anchorRef.current!.getBoundingClientRect()
    // Popover opens beside its anchor; a zero-size anchor at the right edge puts it below.
    setRangeAt(new DOMRect(r.right - POPOVER_W - 16, r.bottom + 6, 0, 0))
  }

  return (
    <div className={s.periodBar}>
      <div className={s.periodNav}>
        <Button
          variant="subtle"
          iconOnly
          icon={<ChevronLeft20Regular />}
          aria-label={t('stats.prev')}
          onClick={() => onChange(shiftPeriod(period, -1))}
        />
        <Button
          variant="subtle"
          iconOnly
          icon={<ChevronRight20Regular />}
          aria-label={t('stats.next')}
          disabled={period.to >= today}
          onClick={() => onChange(shiftPeriod(period, 1))}
        />
        <h2 className={s.periodTitle}>
          {period.kind === 'custom' ? (
            <button type="button" className={s.periodTitleButton} onClick={openRange}>
              {periodTitle(period, fmt)}
            </button>
          ) : (
            periodTitle(period, fmt)
          )}
        </h2>
        {!isCurrent && period.kind !== 'custom' && (
          <Button variant="subtle" onClick={() => onChange(periodOf(period.kind as Exclude<PeriodKind, 'custom'>, today))}>
            {t('stats.current')}
          </Button>
        )}
      </div>
      <div ref={anchorRef}>
        <Segmented<PeriodKind>
          aria-label={t('stats.title')}
          value={period.kind}
          options={KINDS.map((k) => ({ value: k, label: t(`stats.kinds.${k}`) }))}
          onChange={(k) => {
            if (k === 'custom') openRange()
            else onChange(periodOf(k, period.from <= today && today <= period.to ? today : period.from))
          }}
        />
      </div>
      {rangeAt && (
        <RangePopover
          anchor={rangeAt}
          period={period}
          today={today}
          onClose={() => setRangeAt(null)}
          onApply={(p) => {
            setRangeAt(null)
            onChange(p)
          }}
        />
      )}
    </div>
  )
}

function RangePopover({
  anchor,
  period,
  today,
  onClose,
  onApply,
}: {
  anchor: DOMRect
  period: Period
  today: LocalDate
  onClose: () => void
  onApply: (p: Period) => void
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState<string>(period.from)
  const [to, setTo] = useState<string>(period.to > today ? today : period.to)
  const valid = isLocalDate(from) && isLocalDate(to)
  const presets: [string, () => Period][] = [
    [t('stats.range.last7'), () => customPeriod(addDays(today, -6), today)],
    [t('stats.range.last30'), () => customPeriod(addDays(today, -29), today)],
    [t('stats.range.last90'), () => customPeriod(addDays(today, -89), today)],
    [t('stats.range.ytd'), () => customPeriod(`${today.slice(0, 4)}-01-01` as LocalDate, today)],
  ]

  return (
    <Popover anchor={anchor} onClose={onClose} width={POPOVER_W} label={t('stats.range.title')}>
      <div className={s.range}>
        <span className={s.rangeTitle}>{t('stats.range.title')}</span>
        <div className={s.presets}>
          {presets.map(([label, make]) => (
            <button key={label} type="button" className={s.preset} onClick={() => onApply(make())}>
              {label}
            </button>
          ))}
        </div>
        <div className={s.rangeFields}>
          <label>
            <span>{t('stats.range.from')}</span>
            <input type="date" className={f.control} value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span>{t('stats.range.to')}</span>
            <input type="date" className={f.control} value={to} max={today} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <Button
          variant="accent"
          disabled={!valid}
          onClick={() => valid && onApply(customPeriod(from as LocalDate, to as LocalDate))}
        >
          {t('stats.range.apply')}
        </Button>
      </div>
    </Popover>
  )
}
