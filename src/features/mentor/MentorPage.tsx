import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { useSettings } from '@/app/settings'
import { pageTransition } from '@/design/motion'
import { ChatPanel } from './ChatPanel'
import { GoalsSection } from './intake/GoalsSection'
import { IntakePanel } from './intake/IntakePanel'
import { useIntake } from './intake/store'
import { useMentorInput } from './useMentorInput'
import s from './mentor.module.css'

/**
 * The mentor: learning goals it leads the user through and a conversation grounded in the data;
 * the assistant is the conversation alone. Setting up a goal takes the whole page.
 */
export function MentorPage() {
  const { t } = useTranslation()
  const mentor = useMentorInput()
  const intake = useIntake((st) => st.active)
  const assistant = useSettings((st) => st.aiMode === 'assistant')
  // "?ask=…" sends a question right away, e.g. from the suggestion chips on Today.
  const [params, setParams] = useSearchParams()

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.header}>
        <h1 className={s.title}>{assistant ? t('mentor.assistantTitle') : t('mentor.title')}</h1>
        <p className={s.subtitle}>{assistant ? t('mentor.assistantSubtitle') : t('mentor.subtitle')}</p>
      </header>
      {intake ? (
        <IntakePanel mentor={mentor} />
      ) : (
        // One conversation for everything: the day plan is a question away ("plan my tomorrow"),
        // the brief lives on Today. The mentor adds the learning goals above it.
        <>
          <GoalsSection invite={!assistant} />
          <div className={s.chatOnly} data-alone={assistant}>
            <ChatPanel
              mentor={mentor}
              ask={params.get('ask') ?? undefined}
              onAsked={() => setParams({}, { replace: true })}
            />
          </div>
        </>
      )}
    </motion.div>
  )
}
