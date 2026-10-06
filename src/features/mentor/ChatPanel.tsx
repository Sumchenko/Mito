import { CheckmarkRegular, DismissRegular, SendRegular, SparkleRegular } from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestChat } from '@/mentor/api'
import { applyAction, inTimeOrder, loadRefs, storeRefs } from '@/mentor/apply'
import { Button } from '@/ui/Button'
import { addMessage, clearChat, setActionState, useMentor, type StoredMessage } from './store'
import { plain, useMentorText } from './text'
import type { useMentorInput } from './useMentorInput'
import s from './mentor.module.css'

/**
 * Conversation with the mentor. Each question goes with a fresh context of the user's data; the
 * answer may carry proposed actions, which change nothing until the user applies them.
 */
export function ChatPanel({
  mentor,
  ask,
  onAsked,
}: {
  mentor: ReturnType<typeof useMentorInput>
  /** A question to send as soon as the data is ready (e.g. from Today). */
  ask?: string
  onAsked?: () => void
}) {
  const { t } = useTranslation()
  const { errorText, actionLabel } = useMentorText()
  const messages = useMentor((st) => st.messages)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  const send = async (content: string) => {
    const question = content.trim()
    if (!question || busy) return
    setText('')
    setError(null)
    const history = [...messages, addMessage({ role: 'user', content: question })]
    setBusy(true)
    try {
      const { context, refs } = mentor.context()
      const res = await requestChat(
        mentor.lang,
        context,
        history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      )
      addMessage({
        role: 'assistant',
        content: res.reply,
        ...(res.actions.length
          ? {
              actions: inTimeOrder(res.actions).map((action) => ({
                action,
                label: actionLabel(action, context),
                state: 'pending' as const,
              })),
              refs: storeRefs(refs),
            }
          : {}),
      })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // Send the handed-over question once the data has loaded.
  const asked = useRef(false)
  useEffect(() => {
    if (!ask || asked.current || !mentor.ready) return
    asked.current = true
    onAsked?.()
    void send(ask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, mentor.ready])

  const apply = async (m: StoredMessage, index: number) => {
    const a = m.actions?.[index]
    if (!a || !m.refs) return
    try {
      await applyAction(a.action, loadRefs(m.refs), mentor.projects)
      setActionState(m.id, index, 'applied')
    } catch {
      setActionState(m.id, index, 'failed')
    }
  }

  // One after another: each goes through the repositories and may depend on the one before.
  const [applying, setApplying] = useState<string | null>(null)
  const applyAll = async (m: StoredMessage) => {
    setApplying(m.id)
    for (const [i, a] of (m.actions ?? []).entries()) if (a.state === 'pending') await apply(m, i)
    setApplying(null)
  }

  const chips = ['first', 'tomorrow', 'behind', 'split'] as const

  return (
    <section className={`${s.card} ${s.chat}`}>
      <header className={s.cardHead}>
        <h2 className={s.cardTitle}>{t('mentor.chat.title')}</h2>
        {messages.length > 0 && (
          <Button variant="subtle" onClick={clearChat}>
            {t('mentor.chat.clear')}
          </Button>
        )}
      </header>

      <div ref={list} className={s.messages}>
        {/* An empty conversation is an invitation, not a blank box. */}
        {messages.length === 0 && (
          <div className={s.empty}>
            <SparkleRegular className={s.emptyIcon} />
            <h3 className={s.emptyTitle}>{t('mentor.chat.emptyTitle')}</h3>
            <p className={s.hint}>{t('mentor.chat.intro')}</p>
            <div className={s.chips}>
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={s.chip}
                  disabled={busy || !mentor.ready}
                  onClick={() => void send(t(`mentor.chat.chips.${c}`))}
                >
                  {t(`mentor.chat.chips.${c}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const pending = m.actions?.filter((a) => a.state === 'pending').length ?? 0
          return (
          <div key={m.id} className={s.message} data-role={m.role}>
            <p>{plain(m.content)}</p>
            {m.actions?.map((a, i) => (
              <div key={i} className={s.action} data-state={a.state}>
                <span>{a.label}</span>
                {a.state === 'pending' ? (
                  <span className={s.actionButtons}>
                    <Button
                      variant={pending > 1 ? 'standard' : 'accent'}
                      icon={<CheckmarkRegular />}
                      disabled={applying === m.id}
                      aria-label={t('mentor.chat.apply')}
                      onClick={() => void apply(m, i)}
                    >
                      <span className={s.applyLabel}>{t('mentor.chat.apply')}</span>
                    </Button>
                    <Button
                      variant="subtle"
                      iconOnly
                      icon={<DismissRegular />}
                      aria-label={t('mentor.chat.dismiss')}
                      onClick={() => setActionState(m.id, i, 'dismissed')}
                    />
                  </span>
                ) : (
                  <em>
                    {a.state === 'applied'
                      ? t('mentor.chat.applied')
                      : a.state === 'dismissed'
                        ? t('mentor.chat.dismissed')
                        : t('mentor.chat.failedAction')}
                  </em>
                )}
              </div>
            ))}
            {pending > 1 && (
              <div className={s.applyAll}>
                <Button
                  variant="accent"
                  icon={<CheckmarkRegular />}
                  disabled={applying === m.id}
                  onClick={() => void applyAll(m)}
                >
                  {t('mentor.chat.applyAll', { count: pending })}
                </Button>
              </div>
            )}
          </div>
          )
        })}
        {busy && (
          <div className={s.message} data-role="assistant">
            <p className={s.thinking}>{t('mentor.chat.thinking')}</p>
          </div>
        )}
      </div>

      {error && <p className={s.error}>{error}</p>}
      <form
        className={s.composer}
        onSubmit={(e) => {
          e.preventDefault()
          void send(text)
        }}
      >
        <textarea
          value={text}
          rows={1}
          placeholder={t('mentor.chat.placeholder')}
          aria-label={t('mentor.chat.placeholder')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(text)
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
    </section>
  )
}
