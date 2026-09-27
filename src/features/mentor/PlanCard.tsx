import { CalendarArrowRightRegular, SparkleRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { addDays } from '@/data'
import { requestPlan } from '@/mentor/api'
import { applyPlanBlock } from '@/mentor/apply'
import type { MentorContext, PlanResponse } from '@/mentor/protocol'
import type { RefMap } from '@/mentor/context'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Checkbox'
import { Segmented } from '@/ui/Segmented'
import f from '@/ui/fields.module.css'
import { plain, useMentorText } from './text'
import type { useMentorInput } from './useMentorInput'
import s from './mentor.module.css'

type Target = 'today' | 'tomorrow'
type Proposal = { plan: PlanResponse; refs: RefMap; context: MentorContext; picked: boolean[] }

/**
 * "Plan my day": the mentor proposes blocks, the user sees them first and adds the ones they
 * want. Nothing lands on the calendar without that click.
 */
export function PlanCard({ mentor }: { mentor: ReturnType<typeof useMentorInput> }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { errorText } = useMentorText()
  const [target, setTarget] = useState<Target>('today')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [applied, setApplied] = useState<number | null>(null)
  const date = target === 'today' ? mentor.today : addDays(mentor.today, 1)

  const make = async () => {
    setBusy(true)
    setError(null)
    setApplied(null)
    try {
      const { context, refs } = mentor.context()
      const plan = await requestPlan(mentor.lang, context, date, note.trim() || undefined)
      setProposal({ plan, refs, context, picked: plan.blocks.map(() => true) })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    if (!proposal) return
    const chosen = proposal.plan.blocks.filter((_, i) => proposal.picked[i])
    let done = 0
    for (const block of chosen) {
      try {
        await applyPlanBlock(block, proposal.refs)
        done++
      } catch {
        // A block that no longer fits (e.g. its task was deleted meanwhile) is skipped.
      }
    }
    setApplied(done)
    setProposal(null)
  }

  const title = (ref?: string, fallback?: string) =>
    proposal?.context.tasks.find((x) => x.ref === ref)?.title ?? fallback ?? t('mentor.plan.break')
  const count = proposal ? proposal.picked.filter(Boolean).length : 0

  return (
    <section className={s.card}>
      <header className={s.cardHead}>
        <h2 className={s.cardTitle}>
          <SparkleRegular className={s.titleIcon} /> {t('mentor.plan.title')}
        </h2>
        <Segmented<Target>
          aria-label={t('mentor.plan.title')}
          value={target}
          options={[
            { value: 'today', label: t('mentor.plan.today') },
            { value: 'tomorrow', label: t('mentor.plan.tomorrow') },
          ]}
          onChange={(v) => {
            setTarget(v)
            setProposal(null)
          }}
        />
      </header>

      {!proposal && (
        <>
          <p className={s.hint}>{t('mentor.plan.hint')}</p>
          <input
            className={f.control}
            value={note}
            placeholder={t('mentor.plan.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && void make()}
          />
          <div className={s.row}>
            <Button variant="accent" disabled={busy || !mentor.ready} onClick={() => void make()}>
              {busy ? t('mentor.chat.thinking') : t('mentor.plan.make')}
            </Button>
          </div>
        </>
      )}

      {applied !== null && (
        <p className={s.success}>
          {t('mentor.plan.applied', { count: applied })}{' '}
          <button
            type="button"
            className={s.link}
            onClick={() => navigate(`/calendar?date=${date}&view=day`)}
          >
            <CalendarArrowRightRegular /> {t('mentor.plan.openCalendar')}
          </button>
        </p>
      )}
      {error && <p className={s.error}>{error}</p>}

      {proposal && (
        <>
          {proposal.plan.summary && <p className={s.summary}>{plain(proposal.plan.summary)}</p>}
          {proposal.plan.blocks.length === 0 ? (
            <p className={s.hint}>{t('mentor.plan.empty')}</p>
          ) : (
            <ul className={s.planList}>
              {proposal.plan.blocks.map((b, i) => (
                <li key={i} className={s.planItem} data-break={!b.taskRef}>
                  <Checkbox
                    checked={proposal.picked[i]!}
                    label={title(b.taskRef, b.title)}
                    round
                    onChange={(checked) =>
                      setProposal({
                        ...proposal,
                        picked: proposal.picked.map((p, j) => (j === i ? checked : p)),
                      })
                    }
                  />
                  <span className={s.planTime}>
                    {b.start}–{b.end}
                  </span>
                  <span className={s.planText}>
                    <b>{title(b.taskRef, b.title)}</b>
                    {b.reason && <small>{plain(b.reason)}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className={s.row}>
            {count > 0 && (
              <Button variant="accent" onClick={() => void apply()}>
                {t('mentor.plan.apply', { count })}
              </Button>
            )}
            <Button disabled={busy} onClick={() => void make()}>
              {busy ? t('mentor.chat.thinking') : t('mentor.plan.again')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
