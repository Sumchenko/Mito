import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { customPeriod, periodOf, type Period, type PeriodKind } from '@/analytics'
import { isLocalDate, toLocalDate, type LocalDate } from '@/data'

const KINDS: PeriodKind[] = ['week', 'month', 'year', 'custom']
const isKind = (v: string | null): v is PeriodKind => v !== null && (KINDS as string[]).includes(v)

/** The period kind last looked at; the exact dates live in the URL so they can be shared. */
const usePrefs = create<{ kind: Exclude<PeriodKind, 'custom'> }>()(
  persist((): { kind: Exclude<PeriodKind, 'custom'> } => ({ kind: 'week' }), { name: 'mito.stats', version: 1 }),
)

/** ?p=week&d=2026-09-23 or ?p=custom&from=…&to=… */
export function usePeriod() {
  const [params, setParams] = useSearchParams()
  const savedKind = usePrefs((s) => s.kind)
  const today = toLocalDate()

  const kind = isKind(params.get('p')) ? (params.get('p') as PeriodKind) : savedKind
  const from = params.get('from')
  const to = params.get('to')
  const anchor = params.get('d')
  const period: Period =
    kind === 'custom' && isLocalDate(from) && isLocalDate(to)
      ? customPeriod(from, to)
      : periodOf(kind === 'custom' ? 'week' : kind, isLocalDate(anchor) ? anchor : today)

  const setPeriod = useCallback(
    (next: Period) => {
      if (next.kind !== 'custom') usePrefs.setState({ kind: next.kind })
      setParams(
        next.kind === 'custom'
          ? { p: 'custom', from: next.from, to: next.to }
          : { p: next.kind, d: next.from },
        { replace: true },
      )
    },
    [setParams],
  )

  return { period, setPeriod, today: today as LocalDate }
}
