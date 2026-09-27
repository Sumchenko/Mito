import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { pageTransition } from '@/design/motion'
import { BriefCard } from './BriefCard'
import { ChatPanel } from './ChatPanel'
import { PlanCard } from './PlanCard'
import { useMentorInput } from './useMentorInput'
import s from './mentor.module.css'

/** The mentor: a day plan to accept, the daily brief, and a conversation grounded in the data. */
export function MentorPage() {
  const { t } = useTranslation()
  const mentor = useMentorInput()
  // "?ask=…" sends a question right away, e.g. from the suggestion chips on Today.
  const [params, setParams] = useSearchParams()

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.header}>
        <h1 className={s.title}>{t('mentor.title')}</h1>
        <p className={s.subtitle}>{t('mentor.subtitle')}</p>
      </header>
      <div className={s.layout}>
        <ChatPanel
          mentor={mentor}
          ask={params.get('ask') ?? undefined}
          onAsked={() => setParams({}, { replace: true })}
        />
        <div className={s.side}>
          <PlanCard mentor={mentor} />
          <BriefCard mentor={mentor} />
        </div>
      </div>
    </motion.div>
  )
}
