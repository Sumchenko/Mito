import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { pageTransition } from '@/design/motion'
import { Masonry } from '@/ui/Masonry'
import { ActivitySection } from './ActivitySection'
import { bucketize } from './buckets'
import { EstimatesSection } from './EstimatesSection'
import { useStatsFormat } from './format'
import { Overview } from './Overview'
import { PeriodBar } from './PeriodBar'
import { PlanSection } from './PlanSection'
import { ProjectsSection } from './ProjectsSection'
import { RhythmSection } from './RhythmSection'
import { TimeSection } from './TimeSection'
import { usePeriod } from './usePeriod'
import { useStatsData } from './useStatsData'
import s from './stats.module.css'

/**
 * Where the time goes: totals, projects and tasks, plan against fact, estimates and rhythm.
 * Every number comes from `buildReport`, the same pure core the AI mentor will read.
 */
export function StatsPage() {
  const { t } = useTranslation()
  const fmt = useStatsFormat()
  const { period, setPeriod, today } = usePeriod()
  const data = useStatsData(period)
  const buckets = data ? bucketize(data.report) : []

  return (
    <motion.div className={s.page} {...pageTransition}>
      <header className={s.header}>
        <h1 className={s.title}>{t('stats.title')}</h1>
        <PeriodBar period={period} today={today} onChange={setPeriod} fmt={fmt} />
      </header>

      {data && (
        <div className={s.body}>
          <Overview data={data} fmt={fmt} />
          <TimeSection data={data} buckets={buckets} fmt={fmt} />
          {/* Cards differ in height with every period: pack them without holes. */}
          <Masonry>
            <ProjectsSection key="projects" data={data} fmt={fmt} />
            <PlanSection key="plan" data={data} buckets={buckets} fmt={fmt} />
            <RhythmSection key="rhythm" data={data} fmt={fmt} />
            <EstimatesSection key="estimates" data={data} fmt={fmt} />
          </Masonry>
          <ActivitySection data={data} fmt={fmt} />
        </div>
      )}
    </motion.div>
  )
}
