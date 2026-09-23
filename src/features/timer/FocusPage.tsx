import {
  Delete16Regular,
  Next20Filled,
  Pause20Filled,
  Play20Filled,
  Settings20Regular,
  Stop20Filled,
} from '@fluentui/react-icons'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dayRange,
  DomainError,
  entryDuration,
  timeEntriesRepo,
  toLocalDate,
  useAllTasks,
  useTimeEntriesOn,
  type TimeEntry,
} from '@/data'
import { pageTransition } from '@/design/motion'
import { formatMinutes } from '@/lib/format'
import { Button } from '@/ui/Button'
import f from '@/ui/fields.module.css'
import { daypartOf, Landscape } from '@/ui/Landscape'
import { Menu } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { formatClock, type TimerMode } from './engine'
import { useTimerView } from './hooks'
import { requestNotificationPermission } from './signals'
import { timer, useTimer } from './store'
import { TaskPicker } from './TaskPicker'
import s from './timer.module.css'

const R = 118
const CIRCUMFERENCE = 2 * Math.PI * R

export function FocusPage() {
  const { t } = useTranslation()
  const view = useTimerView()
  const { kind } = view.phase

  // Space toggles the timer when the user is not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (e.code !== 'Space' || typing || e.repeat) return
      e.preventDefault()
      const k = useTimer.getState().timer.phase.kind
      if (k === 'running') void timer.pause()
      else if (k === 'paused') void timer.resume()
      else if (k === 'idle') void startNow()
      else void timer.skipBreak()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A stopwatch has no goal, so its ring shows no progress: it is closed and breathes calmly
  // while time is tracked. Only Pomodoro phases fill the ring toward their end.
  const breathing = view.total === undefined
  const progress = breathing
    ? kind === 'running' || kind === 'paused'
      ? 1
      : 0
    : view.countdown
      ? 1 - view.ms / view.total!
      : view.ms / view.total!

  const phaseLabel =
    kind === 'break'
      ? t(view.phase.kind === 'break' && view.phase.long ? 'timer.phase.longBreak' : 'timer.phase.break')
      : t(`timer.phase.${kind}`)

  return (
    <motion.div className={s.page} {...pageTransition}>
      <section className={s.stage} data-phase={kind}>
        <Landscape daypart={daypartOf(new Date(view.now).getHours())} className={s.stageScene} />

        <header className={s.stageHeader}>
          <Segmented<TimerMode>
            aria-label={t('timer.title')}
            value={view.state.mode}
            options={[
              { value: 'stopwatch', label: t('timer.stopwatch') },
              { value: 'pomodoro', label: t('timer.pomodoro') },
            ]}
            onChange={(mode) => timer.setMode(mode)}
          />
          <PomodoroSettings />
        </header>

        <div className={s.ringWrap} data-breathing={breathing && kind === 'running'}>
          <span className={s.halo} aria-hidden />
          <svg className={s.ring} viewBox="0 0 280 280" aria-hidden>
            <circle className={s.ringTrack} cx="140" cy="140" r={R} />
            <circle
              className={s.ringValue}
              cx="140"
              cy="140"
              r={R}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)))}
            />
          </svg>
          <div className={s.ringText}>
            <span className={s.phase}>{phaseLabel}</span>
            <span className={s.clock} aria-live="off">
              {formatClock(view.ms)}
            </span>
            {view.state.mode === 'pomodoro' && (
              <span className={s.cycles} aria-label={t('timer.cycle', { n: view.state.cycles % view.config.longEvery, total: view.config.longEvery })}>
                {Array.from({ length: view.config.longEvery }, (_, i) => (
                  <span key={i} data-done={i < view.state.cycles % view.config.longEvery} />
                ))}
              </span>
            )}
          </div>
        </div>

        <TaskPicker
          value={view.taskId}
          onChange={(taskId) => (kind === 'running' ? void timer.start(taskId) : timer.setNextTask(taskId))}
        />

        <div className={s.controls}>
          {kind === 'idle' && (
            <Button variant="accent" className={s.primary} icon={<Play20Filled />} onClick={() => void startNow()}>
              {t('timer.start')}
            </Button>
          )}
          {kind === 'running' && (
            <Button className={s.primary} icon={<Pause20Filled />} onClick={() => void timer.pause()}>
              {t('timer.pause')}
            </Button>
          )}
          {kind === 'paused' && (
            <Button variant="accent" className={s.primary} icon={<Play20Filled />} onClick={() => void timer.resume()}>
              {t('timer.resume')}
            </Button>
          )}
          {(kind === 'break' || kind === 'breakOver') && (
            <Button variant="accent" className={s.primary} icon={<Next20Filled />} onClick={() => void timer.skipBreak()}>
              {kind === 'break' ? t('timer.skipBreak') : t('timer.nextFocus')}
            </Button>
          )}
          {kind !== 'idle' && (
            <Button icon={<Stop20Filled />} onClick={() => void timer.stop()}>
              {t('timer.stop')}
            </Button>
          )}
        </div>
      </section>

      <Sessions />
    </motion.div>
  )
}

function startNow() {
  const { timer: state, nextTaskId } = useTimer.getState()
  if (state.mode === 'pomodoro') requestNotificationPermission()
  return timer.start(nextTaskId)
}

function PomodoroSettings() {
  const { t } = useTranslation()
  const config = useTimer((st) => st.config)
  const sound = useTimer((st) => st.sound)
  const num = (key: 'focusMin' | 'shortBreakMin' | 'longBreakMin' | 'longEvery', max: number) => (
    <label className={s.setting}>
      <span>{t(`timer.${key}`)}</span>
      <input
        className={f.control}
        type="number"
        min={1}
        max={max}
        value={config[key]}
        onChange={(e) => {
          const v = Math.round(Number(e.target.value))
          if (v >= 1 && v <= max) timer.setConfig({ [key]: v })
        }}
      />
    </label>
  )
  const check = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className={s.settingCheck}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <Menu
      trigger={({ toggle }) => (
        <Button variant="subtle" iconOnly icon={<Settings20Regular />} aria-label={t('timer.settings')} onClick={toggle} />
      )}
      header={
        <div className={s.settings}>
          <h3>{t('timer.settings')}</h3>
          <div className={s.settingGrid}>
            {num('focusMin', 180)}
            {num('shortBreakMin', 60)}
            {num('longBreakMin', 90)}
            {num('longEvery', 12)}
          </div>
          {check(t('timer.autoStartBreak'), config.autoStartBreak, (v) => timer.setConfig({ autoStartBreak: v }))}
          {check(t('timer.autoStartFocus'), config.autoStartFocus, (v) => timer.setConfig({ autoStartFocus: v }))}
          {check(t('timer.sound'), sound, timer.setSound)}
        </div>
      }
      items={[]}
    />
  )
}

function Sessions() {
  const { t, i18n } = useTranslation()
  const today = toLocalDate()
  const entries = useTimeEntriesOn(today)
  const tasks = useAllTasks()
  const view = useTimerView()
  const [error, setError] = useState<string | null>(null)
  const byId = useMemo(() => new Map((tasks ?? []).map((x) => [x.id, x])), [tasks])
  const openTasks = useMemo(() => (tasks ?? []).filter((x) => x.status === 'open'), [tasks])

  const time = (at: number) => new Date(at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })
  const minutes = (ms: number) =>
    formatMinutes(Math.max(1, Math.round(ms / 60_000)), { h: t('common.h'), min: t('common.min') })
  const [from, to] = dayRange(today)
  const clipped = (e: TimeEntry) => Math.min(e.end ?? view.now, to) - Math.max(e.start, from)
  const total = (entries ?? []).reduce((sum, e) => sum + clipped(e), 0)

  const fail = (e: unknown) => setError(t(`errors.${e instanceof DomainError ? e.code : 'unknown'}`))

  return (
    <section className={s.sessions}>
      <header className={s.sessionsHeader}>
        <h2>{t('timer.today')}</h2>
        {total > 0 && (
          <span className={s.total}>
            {t('timer.total')}: <strong>{minutes(total)}</strong>
          </span>
        )}
      </header>

      {entries && entries.length === 0 && <p className={s.empty}>{t('timer.todayEmpty')}</p>}

      <ul className={s.entryList}>
        <AnimatePresence initial={false}>
          {[...(entries ?? [])].reverse().map((entry) => {
            const task = entry.taskId ? byId.get(entry.taskId) : undefined
            return (
              <motion.li
                key={entry.id}
                layout="position"
                className={s.entry}
                data-running={entry.end === null}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className={s.entryTime}>
                  {time(entry.start)}–{entry.end ? time(entry.end) : '…'}
                </span>
                <span className={s.entryTask}>
                  {entry.taskId ? (
                    <span className={s.entryTitle}>{task?.title ?? '—'}</span>
                  ) : (
                    <select
                      className={`${f.control} ${s.assign}`}
                      value=""
                      aria-label={t('timer.assign')}
                      onChange={(e) => e.target.value && void timeEntriesRepo.assignTask([entry.id], e.target.value).catch(fail)}
                    >
                      <option value="">{t('timer.assign')}…</option>
                      {openTasks.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.title}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className={s.entrySource}>{t(`timer.source.${entry.source}`)}</span>
                </span>
                <span className={s.entryDuration}>
                  {entry.end === null ? formatClock(entryDuration(entry, view.now)) : minutes(entryDuration(entry))}
                </span>
                {entry.end !== null && (
                  <button
                    type="button"
                    className={s.entryDelete}
                    aria-label={t('timer.deleteEntry')}
                    title={t('timer.deleteEntry')}
                    onClick={() => void timeEntriesRepo.remove(entry.id)}
                  >
                    <Delete16Regular />
                  </button>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <ManualEntry tasks={openTasks} onError={fail} onDone={() => setError(null)} />
      {error && <p className={s.error}>{error}</p>}
    </section>
  )
}

function ManualEntry({
  tasks,
  onError,
  onDone,
}: {
  tasks: { id: string; title: string }[]
  onError: (e: unknown) => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [taskId, setTaskId] = useState('')
  const [fromTime, setFrom] = useState('')
  const [toTime, setTo] = useState('')

  const add = () => {
    const base = dayRange(toLocalDate())[0]
    const at = (hhmm: string) => {
      const [h, m] = hhmm.split(':').map(Number) as [number, number]
      return base + (h * 60 + m) * 60_000
    }
    if (!fromTime || !toTime) return
    timeEntriesRepo
      .addManual({ taskId: taskId || undefined, start: at(fromTime), end: at(toTime) })
      .then(() => {
        setFrom('')
        setTo('')
        onDone()
      }, onError)
  }

  return (
    <details className={s.manual}>
      <summary>{t('timer.addManual')}</summary>
      <div className={s.manualForm}>
        <select className={f.control} value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={t('timer.pickTask')}>
          <option value="">{t('timer.noTask')}</option>
          {tasks.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
        <label className={s.manualTime}>
          {t('timer.manualFrom')}
          <input className={f.control} type="time" value={fromTime} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={s.manualTime}>
          {t('timer.manualTo')}
          <input className={f.control} type="time" value={toTime} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button variant="accent" onClick={add} disabled={!fromTime || !toTime}>
          {t('timer.add')}
        </Button>
      </div>
    </details>
  )
}
