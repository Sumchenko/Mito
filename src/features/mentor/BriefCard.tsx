import { ArrowSyncRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { requestBrief } from '@/mentor/api'
import { Button } from '@/ui/Button'
import { briefKindAt, saveBrief, useMentor } from './store'
import { plain, useMentorText } from './text'
import type { useMentorInput } from './useMentorInput'
import s from './mentor.module.css'

/**
 * The morning briefing or the evening review. Fetched once per day and kind (then cached on the
 * device) — automatically where `auto` is set, e.g. on Today, otherwise on request.
 */
export function BriefCard({
  mentor,
  auto = false,
  bare = false,
}: {
  mentor: ReturnType<typeof useMentorInput>
  auto?: boolean
  /** Without its own card, for embedding in another panel. */
  bare?: boolean
}) {
  const { t } = useTranslation()
  const { errorText } = useMentorText()
  const kind = briefKindAt(new Date().getHours())
  const key = `${mentor.today}:${kind}`
  const brief = useMentor((st) => st.briefs[key])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    setError(null)
    try {
      const { context } = mentor.context()
      const res = await requestBrief(mentor.lang, context, kind)
      const focus = res.focus
        .map((ref) => context.tasks.find((x) => x.ref === ref)?.title)
        .filter((x): x is string => !!x)
      saveBrief(key, { text: res.text, focus, at: Date.now() })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  // One automatic request per day and kind: a revisit uses the cached brief.
  const tried = useRef<string | null>(null)
  useEffect(() => {
    if (!auto || brief || !mentor.ready || tried.current === key) return
    tried.current = key
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, brief, mentor.ready, key])

  return (
    <section className={bare ? s.bare : s.card}>
      <header className={s.cardHead}>
        <h2 className={s.cardTitle}>
          {kind === 'morning' ? (
            <WeatherSunnyRegular className={s.titleIcon} />
          ) : (
            <WeatherMoonRegular className={s.titleIcon} />
          )}{' '}
          {t(`mentor.brief.${kind}`)}
        </h2>
        {brief && (
          <Button
            variant="subtle"
            iconOnly
            icon={<ArrowSyncRegular className={busy ? s.spin : undefined} />}
            aria-label={t('mentor.brief.refresh')}
            title={t('mentor.brief.refresh')}
            disabled={busy}
            onClick={() => void load()}
          />
        )}
      </header>
      {brief ? (
        <>
          <p className={s.briefText}>{plain(brief.text)}</p>
          {brief.focus.length > 0 && (
            <div className={s.focus}>
              <span>{kind === 'morning' ? t('mentor.brief.focus') : t('mentor.brief.carry')}</span>
              {brief.focus.map((title) => (
                <span key={title} className={s.focusChip}>
                  {title}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <p className={s.hint}>{busy ? t('mentor.chat.thinking') : t('mentor.brief.empty')}</p>
          {!busy && (
            <div className={s.row}>
              <Button disabled={!mentor.ready} onClick={() => void load()}>
                {t('mentor.brief.get')}
              </Button>
            </div>
          )}
        </>
      )}
      {error && <p className={s.error}>{error}</p>}
    </section>
  )
}
