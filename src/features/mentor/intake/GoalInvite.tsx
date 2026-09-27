import { ArrowRightRegular } from '@fluentui/react-icons'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNow } from '@/data'
import { daypartOf, Landscape } from '@/ui/Landscape'
import { startIntake } from './store'
import s from './GoalInvite.module.css'

/*
 * The trail is drawn in the landscape's own coordinates (1200×320, anchored bottom-centre, sliced)
 * so it lands on the tallest ridge: switchbacks from the foot to the summit at x = 816.
 */
const TRAIL =
  'M470 322 C560 306 640 300 690 280 S640 244 694 222 S790 204 756 166 S738 116 786 96 S810 74 816 62'
/** Camps along the trail: the stages of the way up. */
const CAMPS = [
  [690, 280],
  [694, 222],
  [756, 166],
] as const
/** The strict style has no painted scene: one contour line of the same massif instead. */
const CONTOUR =
  'M300 322 L420 280 L500 262 L560 228 L610 214 L660 176 L706 150 L748 108 L790 82 L816 58 L846 96 L884 116 L930 150 L972 140 L1016 118 L1060 150 L1120 186 L1200 214'

/**
 * The invitation to a first learning goal. The mentor's promise told as a picture: a goal is a
 * summit, the plan is the trail up with its camps. One field to say what to learn, and a few
 * examples to start from.
 */
export function GoalInvite() {
  const { t } = useTranslation()
  const now = useNow(60_000)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const start = (first: string) => first.trim() && startIntake(t('mentor.intake.opening'), first)
  const examples = ['python', 'english', 'drawing'] as const

  return (
    <section className={s.invite} aria-labelledby="goal-invite-title">
      <div className={s.scene} aria-hidden>
        <Landscape daypart={daypartOf(new Date(now).getHours())} className={s.landscape} />
        <svg className={s.route} viewBox="0 0 1200 320" preserveAspectRatio="xMidYMax slice">
          <defs>
            {/* The dashed trail is revealed through a solid stroke that draws itself upward. */}
            <mask id="goal-trail-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="320">
              <path className={s.reveal} d={TRAIL} pathLength={1} />
            </mask>
          </defs>
          <path className={s.contour} d={CONTOUR} />
          <path className={s.trail} d={TRAIL} mask="url(#goal-trail-reveal)" />
          {CAMPS.map(([x, y], i) => (
            <circle key={i} className={s.camp} cx={x} cy={y} r={5} style={{ animationDelay: `${0.55 + i * 0.28}s` }} />
          ))}
          <g className={s.flag}>
            <line x1={816} y1={62} x2={816} y2={24} />
            <path d="M816 24 L846 33 L816 42 Z" />
          </g>
        </svg>
      </div>

      <div className={s.body}>
        <h2 id="goal-invite-title" className={s.title}>
          {t('mentor.goals.ctaTitle')}
        </h2>
        <p className={s.text}>{t('mentor.goals.ctaText')}</p>
        <form
          className={s.field}
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) start(text)
            else input.current?.focus()
          }}
        >
          <input
            ref={input}
            value={text}
            placeholder={t('mentor.goals.ctaPlaceholder')}
            aria-label={t('mentor.goals.ctaTitle')}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className={s.go}>
            {t('mentor.goals.start')}
            <ArrowRightRegular />
          </button>
        </form>
        <p className={s.examples}>
          <span>{t('mentor.goals.forExample')}</span>
          {examples.map((k) => (
            <button key={k} type="button" onClick={() => start(t(`mentor.goals.examples.${k}`))}>
              {t(`mentor.goals.examples.${k}`)}
            </button>
          ))}
        </p>
      </div>
    </section>
  )
}
