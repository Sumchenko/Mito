import {
  ArrowCounterclockwiseRegular,
  HatGraduationRegular,
  PauseRegular,
  SendRegular,
} from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGoals } from '@/data'
import { requestIntake, requestRoadmap } from '@/mentor/api'
import { aboutUser } from '@/mentor/context'
import { intakeProgress } from '@/mentor/goals'
import type { IntakeProfile } from '@/mentor/protocol'
import { Button } from '@/ui/Button'
import f from '@/ui/fields.module.css'
import m from '../mentor.module.css'
import { plain, useMentorText } from '../text'
import type { useMentorInput } from '../useMentorInput'
import { RoadmapPreview } from './RoadmapPreview'
import { addIntakeMessage, pauseIntake, setIntake, startIntake, useIntake } from './store'
import s from './intake.module.css'

type Mentor = ReturnType<typeof useMentorInput>

/** Text fields of the profile, in the order a person would read them. */
const TEXT_FIELDS = [
  'title',
  'subject',
  'level',
  'success',
  'motivation',
  'background',
  'schedule',
  'style',
  'constraints',
] as const

/**
 * Setting up a learning goal: the mentor gets to know the user one question at a time, shows
 * what it has understood as it goes, asks to confirm, then proposes the learning plan.
 */
export function IntakePanel({ mentor }: { mentor: Mentor }) {
  const { t } = useTranslation()
  const { errorText } = useMentorText()
  const { phase, messages, options, profile, roadmap } = useIntake()
  const goals = useGoals()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  /** Sends the conversation as it stands; the last message is the user's. */
  const ask = async () => {
    setBusy(true)
    setError(null)
    try {
      const state = useIntake.getState()
      const about = aboutUser(
        mentor.context().context,
        (goals ?? []).map((g) => g.title),
      )
      const res = await requestIntake(mentor.lang, about, state.profile, state.messages)
      addIntakeMessage({ role: 'assistant', content: res.reply })
      setIntake({ options: res.options, profile: res.profile, ...(res.done ? { phase: 'confirm' } : {}) })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const answer = (value: string) => {
    const content = value.trim()
    if (!content || busy) return
    setText('')
    addIntakeMessage({ role: 'user', content })
    void ask()
  }

  // A conversation that ends with the user's words (a first answer handed over from the start
  // card, or a reload while waiting) is sent once the data is ready.
  const sentFor = useRef(-1)
  const waiting = phase === 'talk' && messages.at(-1)?.role === 'user'
  useEffect(() => {
    if (!waiting || busy || !mentor.ready || sentFor.current === messages.length) return
    sentFor.current = messages.length
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, mentor.ready, messages.length])

  const makePlan = async (note?: string) => {
    setBusy(true)
    setError(null)
    try {
      const plan = await requestRoadmap(mentor.lang, mentor.context().context, profile, note)
      setIntake({ phase: 'plan', roadmap: plan, picked: plan.tasks.map(() => true) })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const head = (
    <header className={m.cardHead}>
      <h2 className={m.cardTitle}>
        <HatGraduationRegular className={m.titleIcon} /> {t('mentor.intake.title')}
      </h2>
      <span className={m.row}>
        <Button
          variant="subtle"
          icon={<ArrowCounterclockwiseRegular />}
          onClick={() => startIntake(t('mentor.intake.opening'))}
        >
          {t('mentor.intake.restart')}
        </Button>
        <Button variant="subtle" icon={<PauseRegular />} onClick={pauseIntake}>
          {t('mentor.intake.later')}
        </Button>
      </span>
    </header>
  )

  if (phase === 'plan' && roadmap) {
    return (
      <section className={m.card}>
        {head}
        <RoadmapPreview mentor={mentor} busy={busy} error={error} onAgain={(note) => void makePlan(note)} />
      </section>
    )
  }

  return (
    <section className={m.card}>
      {head}
      <div className={s.intake} data-phase={phase}>
        <div className={s.talk}>
          <div ref={list} className={`${m.messages} ${s.messages}`}>
            {messages.map((msg, i) => (
              <div key={i} className={m.message} data-role={msg.role}>
                <p>{plain(msg.content)}</p>
              </div>
            ))}
            {busy && (
              <div className={m.message} data-role="assistant">
                <p className={m.thinking}>
                  {phase === 'confirm' ? t('mentor.intake.planning') : t('mentor.chat.thinking')}
                </p>
              </div>
            )}
          </div>
          {error && <p className={m.error}>{error}</p>}
          {phase === 'talk' && (
            <>
              {options.length > 0 && !busy && (
                <div className={m.chips}>
                  {options.map((o) => (
                    <button key={o} type="button" className={m.chip} onClick={() => answer(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              <form
                className={m.composer}
                onSubmit={(e) => {
                  e.preventDefault()
                  answer(text)
                }}
              >
                <textarea
                  value={text}
                  rows={1}
                  placeholder={t('mentor.intake.placeholder')}
                  aria-label={t('mentor.intake.placeholder')}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      answer(text)
                    }
                  }}
                />
                <Button
                  type="submit"
                  variant="accent"
                  iconOnly
                  icon={<SendRegular />}
                  aria-label={t('mentor.chat.send')}
                  disabled={busy || !text.trim() || !mentor.ready}
                />
              </form>
            </>
          )}
        </div>

        {phase === 'talk' ? (
          <Understood profile={profile} busy={busy} />
        ) : (
          <ConfirmCard profile={profile} busy={busy || !mentor.ready} onPlan={() => void makePlan()} />
        )}
      </div>
    </section>
  )
}

/** The profile filling in as the user talks: shows the mentor is listening, and what is missing. */
function Understood({ profile, busy }: { profile: IntakeProfile; busy: boolean }) {
  const { t } = useTranslation()
  const { known, total } = intakeProgress(profile)
  const rows = profileRows(profile, (k) => t(`mentor.intake.fields.${k}`))
  return (
    <aside className={s.side}>
      <h3 className={s.sideTitle}>{t('mentor.intake.understood')}</h3>
      <div className={s.progress} role="progressbar" aria-valuenow={known} aria-valuemax={total}>
        <span style={{ width: `${(known / total) * 100}%` }} />
      </div>
      <p className={m.hint}>{t('mentor.intake.progress', { known, total })}</p>
      {rows.length === 0 ? (
        <p className={m.hint}>{t('mentor.intake.nothingYet')}</p>
      ) : (
        <dl className={s.facts}>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {profile.subject && (
        <Button disabled={busy} onClick={() => setIntake({ phase: 'confirm' })}>
          {t('mentor.intake.enough')}
        </Button>
      )}
    </aside>
  )
}

type Field = (typeof TEXT_FIELDS)[number] | 'weeklyHours' | 'targetDate'

function profileRows(profile: IntakeProfile, label: (field: Field) => string): [string, string][] {
  const rows: [string, string][] = TEXT_FIELDS.flatMap((k) =>
    profile[k] ? [[label(k), profile[k]!] as [string, string]] : [],
  )
  if (profile.weeklyMinutes)
    rows.push([label('weeklyHours'), String(Math.round(profile.weeklyMinutes / 6) / 10)])
  if (profile.targetDate) rows.push([label('targetDate'), profile.targetDate])
  return rows
}

/** "Did I get it right?": every field editable, the plan is built from exactly this. */
function ConfirmCard({
  profile,
  busy,
  onPlan,
}: {
  profile: IntakeProfile
  busy: boolean
  onPlan: () => void
}) {
  const { t } = useTranslation()
  const set = (key: keyof IntakeProfile, value: string | number | undefined) => {
    const next: IntakeProfile = { ...profile }
    if (value === undefined || value === '') delete next[key]
    else Object.assign(next, { [key]: value })
    setIntake({ profile: next })
  }
  const long = new Set(['success', 'motivation', 'background', 'constraints'])
  return (
    <aside className={s.side}>
      <h3 className={s.sideTitle}>{t('mentor.intake.confirmTitle')}</h3>
      <p className={m.hint}>{t('mentor.intake.confirmHint')}</p>
      <div className={s.form}>
        {TEXT_FIELDS.map((k) => (
          <label key={k} className={s.field}>
            <span>{t(`mentor.intake.fields.${k}`)}</span>
            {long.has(k) ? (
              <textarea
                className={f.control}
                rows={2}
                value={profile[k] ?? ''}
                onChange={(e) => set(k, e.target.value)}
              />
            ) : (
              <input className={f.control} value={profile[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
            )}
          </label>
        ))}
        <div className={s.pair}>
          <label className={s.field}>
            <span>{t('mentor.intake.fields.weeklyHours')}</span>
            <input
              className={f.control}
              type="number"
              min={0.5}
              max={100}
              step={0.5}
              value={profile.weeklyMinutes ? profile.weeklyMinutes / 60 : ''}
              onChange={(e) => {
                const hours = Number(e.target.value)
                set('weeklyMinutes', hours > 0 ? Math.round(hours * 60) : undefined)
              }}
            />
          </label>
          <label className={s.field}>
            <span>{t('mentor.intake.fields.targetDate')}</span>
            <input
              className={f.control}
              type="date"
              value={profile.targetDate ?? ''}
              onChange={(e) => set('targetDate', e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className={m.row}>
        <Button variant="accent" disabled={busy || !profile.subject} onClick={onPlan}>
          {t('mentor.intake.makePlan')}
        </Button>
        <Button variant="subtle" disabled={busy} onClick={() => setIntake({ phase: 'talk' })}>
          {t('mentor.intake.tellMore')}
        </Button>
      </div>
    </aside>
  )
}
