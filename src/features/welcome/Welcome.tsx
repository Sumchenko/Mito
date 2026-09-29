import { ArrowRightRegular } from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useSettings, type AiMode } from '@/app/settings'
import { useGoals, useNow } from '@/data'
import { duration, ease } from '@/design/motion'
import { openAuthDialog } from '@/features/account/authDialogStore'
import { daypartOf, Landscape } from '@/ui/Landscape'
import s from './Welcome.module.css'

/**
 * The first screen: what Mito is, in one line, and one choice — learn something with the mentor,
 * or simply plan tasks and time with the assistant. Shown until a mode is picked. Someone who
 * already has learning goals (another device, a backup) is taken to be a learner and never sees it.
 */
export function WelcomeGate() {
  const aiMode = useSettings((st) => st.aiMode)
  const setAiMode = useSettings((st) => st.setAiMode)
  const goals = useGoals()
  const hasGoals = (goals?.length ?? 0) > 0

  useEffect(() => {
    if (aiMode === null && hasGoals) setAiMode('mentor')
  }, [aiMode, hasGoals, setAiMode])

  if (aiMode !== null || goals === undefined || hasGoals) return null
  return <Welcome />
}

function Welcome() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAiMode = useSettings((st) => st.setAiMode)
  const now = useNow(60_000)

  const choose = (mode: AiMode) => {
    setAiMode(mode)
    navigate(mode === 'mentor' ? '/mentor' : '/')
  }
  const appear = (i: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: duration.slow, ease: ease.out, delay: 0.08 * i },
  })

  return (
    <div className={s.welcome} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <Landscape daypart={daypartOf(new Date(now).getHours())} className={s.scene} />
      <div className={s.inner}>
        <motion.header className={s.head} {...appear(0)}>
          <span className={s.brand}>
            <span className={s.logo} aria-hidden>
              M
            </span>
            Mito
          </span>
          <p className={s.tagline}>{t('welcome.tagline')}</p>
          <h1 id="welcome-title" className={s.title}>
            {t('welcome.title')}
          </h1>
        </motion.header>

        <div className={s.choices}>
          <motion.button type="button" className={s.choice} onClick={() => choose('mentor')} {...appear(1)}>
            <MentorArt />
            <ChoiceTitle text={t('welcome.mentorTitle')} />
            <span className={s.choiceText}>{t('welcome.mentorText')}</span>
          </motion.button>
          <motion.button type="button" className={s.choice} onClick={() => choose('assistant')} {...appear(2)}>
            <AssistantArt />
            <ChoiceTitle text={t('welcome.assistantTitle')} />
            <span className={s.choiceText}>{t('welcome.assistantText')}</span>
          </motion.button>
        </div>

        <motion.p className={s.foot} {...appear(3)}>
          <span>{t('welcome.note')}</span>
          <button type="button" className={s.link} onClick={() => openAuthDialog('signIn')}>
            {t('welcome.signIn')}
          </button>
        </motion.p>
      </div>
    </div>
  )
}

/** The arrow travels with the last word, so a wrapped title never leaves it alone on a line. */
function ChoiceTitle({ text }: { text: string }) {
  const cut = text.lastIndexOf(' ')
  return (
    <span className={s.choiceTitle}>
      {text.slice(0, cut + 1)}
      <span className={s.nowrap}>
        {text.slice(cut + 1)}
        <ArrowRightRegular />
      </span>
    </span>
  )
}

/** A summit with the trail up to it: the mentor's way, as on the goal invitation. */
function MentorArt() {
  return (
    <svg className={s.art} viewBox="0 0 160 72" aria-hidden>
      <path className={s.hill} d="M0 72 L46 40 L70 50 L112 14 L160 56 L160 72 Z" />
      <path className={s.trail} d="M24 70 C48 66 60 62 72 58 S66 46 84 42 S104 34 98 28 S108 20 112 14" />
      <circle className={s.camp} cx="72" cy="58" r="3" />
      <circle className={s.camp} cx="98" cy="28" r="3" />
      <line className={s.pole} x1="112" y1="14" x2="112" y2="2" />
      <path className={s.flag} d="M112 2 L124 6 L112 10 Z" />
    </svg>
  )
}

/** A week of the calendar with its blocks: plain planning, well kept. */
function AssistantArt() {
  const blocks = [
    [0, 10, 18],
    [0, 34, 14],
    [1, 18, 24],
    [2, 8, 12],
    [2, 26, 20],
    [3, 14, 16],
    [4, 22, 26],
  ] as const
  return (
    <svg className={s.art} viewBox="0 0 160 72" aria-hidden>
      {[0, 1, 2, 3, 4].map((d) => (
        <rect key={d} className={s.column} x={8 + d * 30} y={4} width={24} height={64} rx={4} />
      ))}
      {blocks.map(([d, y, h], i) => (
        <rect key={i} className={s.block} data-alt={i % 3 === 1} x={10 + d * 30} y={y} width={20} height={h} rx={3} />
      ))}
    </svg>
  )
}
