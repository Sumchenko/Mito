import { describe, expect, it } from 'vitest'
import { goalsRepo, mentorNotesRepo, tasksRepo } from '@/data'
import { intakeProgress, onStudyDay, startGoal, toGoalProfile } from './goals'
import type { RoadmapResponse } from './protocol'

const roadmap: RoadmapResponse = {
  title: 'Python for data',
  summary: 'Practice first',
  stages: [
    { id: 's1', title: 'Basics', outcome: 'Writes scripts', weeks: 2 },
    { id: 's2', title: 'pandas', outcome: 'Cleans a CSV', weeks: 3 },
  ],
  tasks: [
    { title: 'Loops', stageId: 's1', estimateMin: 45, plannedDate: '2026-09-28', notes: 'Ch. 4' },
    { title: 'Skipped', stageId: 's1' },
    { title: 'Late', stageId: 's2', plannedDate: '2026-09-01' },
  ],
  notes: ['Studies in the evening'],
}

describe('intake profile', () => {
  it('counts the essentials', () => {
    expect(intakeProgress({ subject: 'Python', weeklyMinutes: 120 })).toEqual({ known: 2, total: 4 })
  })

  it('keeps text fields for the goal', () => {
    expect(toGoalProfile({ title: 'T', subject: 'Python', level: 'zero', weeklyMinutes: 60 })).toEqual({
      subject: 'Python',
      level: 'zero',
    })
  })
})

describe('study days', () => {
  it('moves a day onto the next study day', () => {
    // 2026-09-30 is a Wednesday (2); study days: Monday, Thursday, Saturday.
    expect(onStudyDay('2026-09-30', [0, 3, 5])).toBe('2026-10-01')
    expect(onStudyDay('2026-10-01', [0, 3, 5])).toBe('2026-10-01')
    expect(onStudyDay('2026-10-04', [0, 3, 5])).toBe('2026-10-05')
    expect(onStudyDay('2026-09-30', [])).toBe('2026-09-30')
    expect(onStudyDay('2026-09-30')).toBe('2026-09-30')
  })

  it('a new goal keeps its study days and plans onto them', async () => {
    const goal = await startGoal(
      { ...roadmap, tasks: [{ title: 'On Wednesday', stageId: 's1', plannedDate: '2026-09-30' }] },
      { subject: 'Python', studyDays: [0, 3] },
      [true],
      '2026-09-27',
    )
    expect(goal.studyDays).toEqual([0, 3])
    const [task] = await tasksRepo.listByProject(goal.projectId!)
    expect(task?.plannedDate).toBe('2026-10-01')
    await goalsRepo.update(goal.id, { studyDays: [] })
    expect((await goalsRepo.get(goal.id))?.studyDays).toBeUndefined()
    await expect(goalsRepo.update(goal.id, { studyDays: [7] })).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('startGoal', () => {
  it('creates the goal, the picked tasks and the notes', async () => {
    const goal = await startGoal(
      roadmap,
      { subject: 'Python', level: 'zero', weeklyMinutes: 240 },
      [true, false, true],
      '2026-09-27',
    )
    expect(goal).toMatchObject({ title: 'Python for data', weeklyMinutes: 240 })
    const tasks = await tasksRepo.listByProject(goal.projectId!)
    expect(tasks.map((t) => t.title)).toEqual(['Loops', 'Late'])
    expect(tasks[0]).toMatchObject({ goalId: goal.id, stageId: 's1', plannedDate: '2026-09-28', notes: 'Ch. 4' })
    expect(tasks[1]?.plannedDate).toBeUndefined()
    expect((await mentorNotesRepo.list(goal.id)).map((n) => n.text)).toEqual(['Studies in the evening'])
    expect((await goalsRepo.get(goal.id))?.stages[0]?.status).toBe('active')
  })
})
