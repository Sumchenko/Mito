import {
  ArrowRightRegular,
  CheckmarkRegular,
  DismissRegular,
  SendRegular,
  SparkleRegular,
} from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  goalsRepo,
  toLocalDate,
  type Goal,
  type MentorNote,
  type Task,
  type TimeEntry,
} from '@/data'
import { requestCoach } from '@/mentor/api'
import { applyProposal, buildGoalContext } from '@/mentor/coach'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Checkbox'
import m from '../mentor.module.css'
import { plain, useMentorText } from '../text'
import { endSession, updateSession, useCoach, type CoachSession } from './coachStore'
import s from './CoachPanel.module.css'

interface Props {
  goal: Goal
  tasks: readonly Task[]
  entries: readonly TimeEntry[]
  notes: readonly MentorNote[]
}

/**
 * A coaching session on a goal — the weekly check-in, help with a task that does not go, or the
 * stage check. The mentor opens it, a short conversation follows, and it ends with a proposal
 * that changes nothing until accepted.
 */
export function CoachPanel({ goal, tasks, entries, notes }: Props) {
  const session = useCoach((st) => (st.session?.goalId === goal.id ? st.session : null))
  if (!session) return null
  return <Session session={session} goal={goal} tasks={tasks} entries={entries} notes={notes} />
}

function Session({ session, goal, tasks, entries, notes }: Props & { session: CoachSession }) {
  const { t, i18n } = useTranslation()
  const { errorText, day } = useMentorText()
  const lang = i18n.language === 'en' ? 'en' : 'ru'
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const { kind, messages, options, done, proposal } = session

  useEffect(() => {
    panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [kind, session.taskId, session.stageId])
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  const ask = async () => {
    setBusy(true)
    setError(null)
    try {
      const now = Date.now()
      const { context, refs } = buildGoalContext(goal, tasks, entries, notes, now)
      const current = useCoach.getState().session
      if (!current) return
      const taskRef = [...refs].find(([, id]) => id === current.taskId)?.[0]
      const res = await requestCoach(lang, current.kind, toLocalDate(now), context, current.messages, {
        ...(taskRef ? { taskRef } : {}),
        ...(current.stageId ? { stageId: current.stageId } : {}),
      })
      updateSession({
        messages: [...current.messages, { role: 'assistant', content: res.reply }],
        options: res.options,
        done: res.done,
        refs: [...refs],
        ...(res.proposal ? { proposal: res.proposal, picked: res.proposal.tasks.map(() => true) } : {}),
      })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // The mentor speaks first, and answers whenever the conversation ends with the user's words.
  const sentFor = useRef(-1)
  const waiting = !done && (messages.length === 0 || messages.at(-1)?.role === 'user')
  useEffect(() => {
    if (!waiting || busy || sentFor.current === messages.length) return
    sentFor.current = messages.length
    void ask()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, messages.length])

  const answer = (value: string) => {
    const content = value.trim()
    if (!content || busy) return
    setText('')
    updateSession({ messages: [...messages, { role: 'user', content }], options: [] })
  }

  const apply = async (advance = false) => {
    if (!proposal) return
    setBusy(true)
    setError(null)
    try {
      await applyProposal(proposal, {
        goal,
        kind,
        refs: new Map(session.refs),
        picked: session.picked,
        today: toLocalDate(Date.now()),
        ...(session.stageId ? { stageId: session.stageId } : {}),
        advance,
      })
      endSession()
    } catch {
      setError(t('mentor.coach.failed'))
    } finally {
      setBusy(false)
    }
  }

  const task = session.taskId ? tasks.find((x) => x.id === session.taskId) : undefined
  const stage = session.stageId ? goal.stages.find((x) => x.id === session.stageId) : undefined
  const refTitle = (ref?: string) => {
    const id = session.refs.find(([r]) => r === ref)?.[1]
    return tasks.find((x) => x.id === id)?.title
  }
  const check = proposal?.check
  // A check has no quick answers except an honest "I don't know".
  const chips = kind === 'check' ? (messages.length ? [t('mentor.coach.dontKnow')] : []) : options
  const count = session.picked.filter(Boolean).length

  return (
    <section ref={panel} className={s.panel} data-kind={kind}>
      <header className={s.head}>
        <SparkleRegular className={s.icon} />
        <div className={s.headText}>
          <h2 className={s.title}>{t(`mentor.coach.titles.${kind}`)}</h2>
          {(task || stage) && <p className={s.subject}>{task?.title ?? stage?.title}</p>}
        </div>
        {kind === 'check' && stage && !done && (
          <Button
            variant="subtle"
            onClick={() => {
              void goalsRepo.completeStage(goal.id, stage.id)
              endSession()
            }}
          >
            {t('mentor.coach.skipCheck')}
          </Button>
        )}
        <Button variant="subtle" iconOnly icon={<DismissRegular />} aria-label={t('mentor.coach.close')} onClick={endSession} />
      </header>

      <div ref={list} className={`${m.messages} ${s.messages}`}>
        {messages.map((msg, i) => (
          <div key={i} className={m.message} data-role={msg.role}>
            <p>{plain(msg.content)}</p>
          </div>
        ))}
        {busy && (
          <div className={m.message} data-role="assistant">
            <p className={m.thinking}>{t('mentor.chat.thinking')}</p>
          </div>
        )}
      </div>
      {error && (
        <p className={m.error}>
          {error}{' '}
          <button type="button" className={m.link} onClick={() => void ask()}>
            {t('mentor.brief.refresh')}
          </button>
        </p>
      )}

      {!done && (
        <>
          {chips.length > 0 && !busy && (
            <div className={m.chips}>
              {chips.map((o) => (
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
              rows={kind === 'check' ? 3 : 1}
              placeholder={t('mentor.coach.placeholder')}
              aria-label={t('mentor.coach.placeholder')}
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
              disabled={busy || !text.trim() || messages.length === 0}
            />
          </form>
        </>
      )}

      {done && !proposal && (
        <div className={s.actions}>
          <Button
            onClick={() => {
              if (kind === 'review') void goalsRepo.markReviewed(goal.id)
              endSession()
            }}
          >
            {t('mentor.coach.close')}
          </Button>
        </div>
      )}

      {done && proposal && (
        <div className={s.proposal}>
          {check && (
            <div className={s.verdict} data-passed={check.passed}>
              <div className={s.verdictHead}>
                <b>{check.passed ? t('mentor.coach.passed') : t('mentor.coach.notPassed')}</b>
                <span>{t('mentor.coach.score', { value: Math.round(check.score * 100) })}</span>
              </div>
              <div className={s.meter} aria-hidden>
                <span style={{ width: `${check.score * 100}%` }} />
              </div>
              {check.gaps.length > 0 && (
                <ul className={s.gaps}>
                  {check.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {proposal.tasks.length > 0 && (
            <section className={s.block}>
              <h3 className={s.blockTitle}>{t('mentor.coach.tasks')}</h3>
              <ul className={s.items}>
                {proposal.tasks.map((x, i) => (
                  <li key={i} className={s.item}>
                    <Checkbox
                      round
                      checked={session.picked[i] ?? false}
                      label={x.title}
                      onChange={(v) => updateSession({ picked: session.picked.map((p, j) => (j === i ? v : p)) })}
                    />
                    <span className={s.itemText}>
                      <b>{x.title}</b>
                      {x.notes && <span>{plain(x.notes)}</span>}
                      <small>
                        {[
                          x.parentRef && t('mentor.coach.step', { title: refTitle(x.parentRef) ?? '—' }),
                          x.plannedDate && day(x.plannedDate),
                          x.estimateMin && t('mentor.roadmap.minutes', { count: x.estimateMin }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {proposal.moves.length > 0 && (
            <section className={s.block}>
              <h3 className={s.blockTitle}>{t('mentor.coach.moves')}</h3>
              <ul className={s.lines}>
                {proposal.moves.map((mv) => (
                  <li key={mv.taskRef}>
                    {refTitle(mv.taskRef)} <ArrowRightRegular /> {day(mv.date)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {proposal.notes.length > 0 && (
            <section className={s.block}>
              <h3 className={s.blockTitle}>{t('mentor.coach.remember')}</h3>
              <ul className={s.lines}>
                {proposal.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}

          <div className={s.actions}>
            {kind === 'check' && check && !check.passed ? (
              <>
                <Button variant="accent" icon={<CheckmarkRegular />} disabled={busy} onClick={() => void apply()}>
                  {t('mentor.coach.addReview')}
                  {count ? ` (${count})` : ''}
                </Button>
                <Button disabled={busy} onClick={() => void apply(true)}>
                  {t('mentor.coach.advance')}
                </Button>
              </>
            ) : (
              <Button variant="accent" icon={<CheckmarkRegular />} disabled={busy} onClick={() => void apply()}>
                {kind === 'check' ? t('mentor.coach.nextStage') : t('mentor.coach.accept')}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
