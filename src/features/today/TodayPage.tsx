import {
  CheckmarkCircle20Regular,
  DataTrending20Regular,
  Send20Filled,
  Sparkle20Filled,
  Target20Regular,
  Timer20Regular,
} from '@fluentui/react-icons'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { pageTransition } from '@/design/motion'
import { daypartOf, Landscape } from '@/ui/Landscape'
import { StatTile } from '@/ui/StatTile'
import s from './TodayPage.module.css'

function greetingKey(hour: number) {
  if (hour < 5) return 'today.greetingNight' as const
  if (hour < 12) return 'today.greetingMorning' as const
  if (hour < 18) return 'today.greetingDay' as const
  return 'today.greetingEvening' as const
}

// Values are zero until the data layer (stage 1) and timer (stage 3) feed real numbers.
export function TodayPage() {
  const { t, i18n } = useTranslation()
  const now = new Date()
  const hour = now.getHours() + now.getMinutes() / 60
  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now)

  return (
    <motion.div className={s.page} {...pageTransition}>
      <div className={s.main}>
        <header className={s.hero}>
          <Landscape daypart={daypartOf(now.getHours())} className={s.scene} />
          <div className={s.heroText}>
            <p className={s.date}>{date}</p>
            <h1 className={s.greeting}>{t(greetingKey(now.getHours()))}</h1>
            <p className={s.heroLine}>{t('today.heroLine')}</p>
          </div>
        </header>

        <div className={s.tiles}>
          <StatTile
            icon={<Timer20Regular />}
            tint="var(--tint-blue)"
            label={t('today.tiles.focusTime')}
            value={
              <>
                0<small>{t('today.hours')}</small>00<small>{t('today.minutes')}</small>
              </>
            }
            hint={t('today.tiles.focusTimeHint')}
          />
          <StatTile
            icon={<CheckmarkCircle20Regular />}
            tint="var(--tint-green)"
            label={t('today.tiles.tasksDone')}
            value="0 / 0"
            progress={0}
          />
          <StatTile
            icon={<Target20Regular />}
            tint="var(--tint-violet)"
            label={t('today.tiles.sessions')}
            value="0"
            hint={t('today.tiles.sessionsHint')}
          />
          <StatTile
            icon={<DataTrending20Regular />}
            tint="var(--tint-orange)"
            label={t('today.tiles.plan')}
            value="0%"
            hint={t('today.tiles.planHint')}
          />
        </div>

        <div className={s.columns}>
          <section className={s.card}>
            <h2 className={s.cardTitle}>{t('today.focus')}</h2>
            <p className={s.empty}>{t('today.focusEmpty')}</p>
          </section>

          <section className={s.card}>
            <h2 className={s.cardTitle}>{t('today.plan')}</h2>
            <DayTimeline hour={hour} />
            <p className={s.empty}>{t('today.planEmpty')}</p>
          </section>
        </div>
      </div>

      <MentorPanel />
    </motion.div>
  )
}

/** Vertical hour grid with a "now" line — the seed of the calendar day view. */
function DayTimeline({ hour }: { hour: number }) {
  const start = 8
  const end = 22
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const inRange = hour >= start && hour <= end
  return (
    <div className={s.timeline} aria-hidden>
      {hours.map((h) => (
        <div key={h} className={s.hourRow}>
          <span className="tabular">{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}
      {inRange && (
        <div className={s.now} style={{ top: `${((hour - start) / (end - start)) * 100}%` }} />
      )}
    </div>
  )
}

function MentorPanel() {
  const { t } = useTranslation()
  const chips = [t('today.mentor.chipPlan'), t('today.mentor.chipFocus'), t('today.mentor.chipReview')]
  return (
    <aside className={s.mentor}>
      <div className={s.mentorHead}>
        <span className={s.mentorIcon}>
          <Sparkle20Filled />
        </span>
        <h2 className={s.cardTitle}>{t('today.mentor.title')}</h2>
        <span className={s.badge}>{t('today.mentor.status')}</span>
      </div>
      <p className={s.mentorIntro}>{t('today.mentor.intro')}</p>
      <div className={s.mentorFooter}>
        <label className={s.input}>
          <input placeholder={t('today.mentor.placeholder')} disabled />
          <Send20Filled className={s.send} />
        </label>
        <div className={s.chips}>
          {chips.map((c) => (
            <button key={c} type="button" className={s.chip} disabled>
              {c}
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
