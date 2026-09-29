import { describe, expect, it } from 'vitest'
import { goalsRepo, mentorNotesRepo, tasksRepo, timeEntriesRepo, type Goal } from '@/data'
import { applyProposal, buildGoalContext, goalSignals, reviewDue } from './coach'

const DAY = 86_400_000
const setup = async () => {
  const goal = await goalsRepo.create({
    title: 'Python',
    profile: { subject: 'Python', level: 'zero' },
    stages: [
      { id: 's1', title: 'Basics', outcome: 'Scripts' },
      { id: 's2', title: 'pandas', outcome: 'CSV' },
    ],
    weeklyMinutes: 300,
  })
  const loops = await tasksRepo.create({
    title: 'Loops',
    projectId: goal.projectId,
    goalId: goal.id,
    stageId: 's1',
    plannedDate: '2020-01-01',
  })
  const syntax = await tasksRepo.create({ title: 'Syntax', projectId: goal.projectId, goalId: goal.id, stageId: 's1' })
  await tasksRepo.setStatus(syntax.id, 'done')
  await timeEntriesRepo.addManual({ taskId: syntax.id, start: Date.now() - 2 * DAY, end: Date.now() - 2 * DAY + 3_600_000 })
  return { goal, loops, syntax }
}

describe('coaching', () => {
  it('is due for a meeting a week after the start or the last one', () => {
    const goal = { status: 'active', createdAt: 0 } as Goal
    expect(reviewDue(goal, 6 * DAY)).toBe(false)
    expect(reviewDue(goal, 7 * DAY)).toBe(true)
    expect(reviewDue({ ...goal, lastReviewAt: 5 * DAY }, 8 * DAY)).toBe(false)
    expect(reviewDue({ ...goal, status: 'paused' }, 30 * DAY)).toBe(false)
  })

  it('shows the goal by refs, with tracked time', async () => {
    const { goal, loops } = await setup()
    const tasks = await tasksRepo.listAll()
    const entries = await timeEntriesRepo.inRange(0, Date.now())
    const { context, refs } = buildGoalContext(goal, tasks, entries, [], Date.now())
    expect(context.tasks.map((t) => [t.title, t.status, t.trackedMin])).toEqual([
      ['Loops', 'open', 0],
      ['Syntax', 'done', 60],
    ])
    expect(refs.get('t1')).toBe(loops.id)
    expect(JSON.stringify(context)).not.toContain(goal.id)
    const [signal] = goalSignals([goal], tasks, entries, Date.now())
    expect(signal).toMatchObject({ title: 'Python', stage: 'Basics', slipped: 1, idleDays: 1 })
  })

  it('applies a meeting: new tasks, steps, moves, notes', async () => {
    const { goal, loops } = await setup()
    const { refs } = buildGoalContext(goal, await tasksRepo.listAll(), [], [], Date.now())
    await applyProposal(
      {
        tasks: [
          { title: 'Dicts', stageId: 's1', plannedDate: '2999-01-01' },
          { title: 'Step 1', stageId: 's1', parentRef: 't1' },
          { title: 'Skipped', stageId: 's1' },
        ],
        moves: [{ taskRef: 't1', date: '2999-01-02' }],
        notes: ['Evenings only'],
      },
      { goal, kind: 'review', refs, picked: [true, true, false], today: '2026-09-29' },
    )
    const all = await tasksRepo.listAll()
    expect(all.find((t) => t.title === 'Dicts')).toMatchObject({ goalId: goal.id, stageId: 's1', plannedDate: '2999-01-01' })
    expect(all.find((t) => t.title === 'Step 1')).toMatchObject({ parentId: loops.id, goalId: goal.id })
    expect(all.some((t) => t.title === 'Skipped')).toBe(false)
    expect((await tasksRepo.get(loops.id))?.plannedDate).toBe('2999-01-02')
    expect((await mentorNotesRepo.list(goal.id)).map((n) => n.text)).toEqual(['Evenings only'])
    expect((await goalsRepo.get(goal.id))?.lastReviewAt).toBeDefined()
  })

  it('lands proposed days on study days', async () => {
    const { goal, loops } = await setup()
    await goalsRepo.update(goal.id, { studyDays: [0, 3] })
    const withDays = (await goalsRepo.get(goal.id))!
    const { refs } = buildGoalContext(withDays, await tasksRepo.listAll(), [], [], Date.now())
    await applyProposal(
      { tasks: [{ title: 'Wed task', stageId: 's1', plannedDate: '2999-01-02' }], moves: [{ taskRef: 't1', date: '2999-01-02' }], notes: [] },
      { goal: withDays, kind: 'review', refs, picked: [true], today: '2026-09-29' },
    )
    // 2999-01-02 is a Wednesday; the next study day is Thursday the 3rd.
    expect((await tasksRepo.listAll()).find((t) => t.title === 'Wed task')?.plannedDate).toBe('2999-01-03')
    expect((await tasksRepo.get(loops.id))?.plannedDate).toBe('2999-01-03')
  })

  it('records a check and moves on only when passed or asked to', async () => {
    const { goal } = await setup()
    const failed = { tasks: [{ title: 'Review loops', stageId: 's1' }], moves: [], notes: [], check: { score: 0.4, passed: false, gaps: ['loops'] } }
    await applyProposal(failed, { goal, kind: 'check', refs: new Map(), picked: [true], today: '2026-09-29', stageId: 's1' })
    let saved = await goalsRepo.get(goal.id)
    expect(saved?.stages.map((s) => s.status)).toEqual(['active', 'upcoming'])
    expect(saved?.stages[0]?.checks).toHaveLength(1)

    await applyProposal(failed, { goal, kind: 'check', refs: new Map(), picked: [true], today: '2026-09-29', stageId: 's1', advance: true })
    saved = await goalsRepo.get(goal.id)
    expect(saved?.stages.map((s) => s.status)).toEqual(['done', 'active'])
    expect((await tasksRepo.listAll()).filter((t) => t.title === 'Review loops')).toHaveLength(1)
  })
})
