import { ArrowLeftRegular, RocketRegular } from '@fluentui/react-icons'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startGoal } from '@/mentor/goals'
import type { RoadmapTask } from '@/mentor/protocol'
import { Button } from '@/ui/Button'
import { Checkbox } from '@/ui/Checkbox'
import f from '@/ui/fields.module.css'
import m from '../mentor.module.css'
import { plain, useMentorText } from '../text'
import type { useMentorInput } from '../useMentorInput'
import { resetIntake, setIntake, useIntake } from './store'
import s from './intake.module.css'

/**
 * The proposed learning plan: stages with their results, the first tasks by day (each can be
 * left out), and what the mentor will remember. Nothing is created before "Start learning".
 */
export function RoadmapPreview({
  mentor,
  busy,
  error,
  onAgain,
}: {
  mentor: ReturnType<typeof useMentorInput>
  busy: boolean
  error: string | null
  onAgain: (note?: string) => void
}) {
  const { t } = useTranslation()
  const { day } = useMentorText()
  const { roadmap, picked, profile } = useIntake()
  const [note, setNote] = useState('')
  const [starting, setStarting] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!roadmap) return null

  const count = picked.filter(Boolean).length
  // First tasks grouped by day, in date order; undated ones last.
  const byDay = new Map<string, { task: RoadmapTask; index: number }[]>()
  roadmap.tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => (a.task.plannedDate ?? '9999').localeCompare(b.task.plannedDate ?? '9999'))
    .forEach((item) => {
      const key = item.task.plannedDate ?? ''
      byDay.set(key, [...(byDay.get(key) ?? []), item])
    })
  const stageNo = (id: string) => roadmap.stages.findIndex((x) => x.id === id) + 1

  const start = async () => {
    setStarting(true)
    setFailed(false)
    try {
      await startGoal(roadmap, profile, picked, mentor.today)
      resetIntake()
    } catch {
      setFailed(true)
      setStarting(false)
    }
  }

  return (
    <div className={s.roadmap}>
      <div className={s.roadmapHead}>
        <h3 className={s.roadmapTitle}>{roadmap.title}</h3>
        {roadmap.summary && <p className={m.summary}>{plain(roadmap.summary)}</p>}
      </div>

      <div className={s.roadmapBody}>
        <section>
          <h4 className={s.sideTitle}>{t('mentor.roadmap.stages')}</h4>
          <ol className={s.stages}>
            {roadmap.stages.map((stage, i) => (
              <li key={stage.id} className={s.stage}>
                <span className={s.stageNo}>{i + 1}</span>
                <span className={s.stageText}>
                  <b>{stage.title}</b>
                  <span>{plain(stage.outcome)}</span>
                  {stage.weeks && <small>{t('mentor.roadmap.weeks', { count: stage.weeks })}</small>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h4 className={s.sideTitle}>{t('mentor.roadmap.firstTasks')}</h4>
          <div className={s.days}>
            {[...byDay].map(([date, items]) => (
              <div key={date} className={s.day}>
                <span className={s.dayLabel}>{date ? day(date) : t('mentor.roadmap.noDate')}</span>
                <ul className={s.tasks}>
                  {items.map(({ task, index }) => (
                    <li key={index} className={s.task}>
                      <Checkbox
                        round
                        checked={picked[index] ?? false}
                        label={task.title}
                        onChange={(checked) =>
                          setIntake({ picked: picked.map((p, j) => (j === index ? checked : p)) })
                        }
                      />
                      <span className={s.taskText}>
                        <b>{task.title}</b>
                        {task.notes && <span>{plain(task.notes)}</span>}
                        <small>
                          {[t('mentor.roadmap.stage', { index: stageNo(task.stageId) }), task.estimateMin && t('mentor.roadmap.minutes', { count: task.estimateMin })]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {roadmap.notes.length > 0 && (
            <>
              <h4 className={s.sideTitle}>{t('mentor.roadmap.notes')}</h4>
              <ul className={s.notes}>
                {roadmap.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {(error || failed) && <p className={m.error}>{error ?? t('mentor.errors.failed')}</p>}
      <div className={s.roadmapActions}>
        <Button
          variant="accent"
          icon={<RocketRegular />}
          disabled={busy || starting}
          onClick={() => void start()}
        >
          {t('mentor.roadmap.start', { count })}
        </Button>
        <input
          className={`${f.control} ${s.againInput}`}
          value={note}
          placeholder={t('mentor.roadmap.againPlaceholder')}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && onAgain(note.trim() || undefined)}
        />
        <Button disabled={busy || starting} onClick={() => onAgain(note.trim() || undefined)}>
          {busy ? t('mentor.intake.planning') : t('mentor.roadmap.again')}
        </Button>
        <Button
          variant="subtle"
          icon={<ArrowLeftRegular />}
          disabled={busy || starting}
          onClick={() => setIntake({ phase: 'confirm' })}
        >
          {t('mentor.roadmap.back')}
        </Button>
      </div>
    </div>
  )
}
