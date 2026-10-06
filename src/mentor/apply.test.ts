import { describe, expect, it } from 'vitest'
import { inTimeOrder } from './apply'
import type { MentorAction } from './protocol'

describe('inTimeOrder', () => {
  it('puts proposals in time order, undated last, ties as proposed', () => {
    const actions: MentorAction[] = [
      { type: 'schedule', taskRef: 't1', date: '2026-10-07', start: '15:00', end: '16:00' },
      { type: 'create_task', title: 'Someday' },
      { type: 'schedule', taskRef: 't2', date: '2026-10-07', start: '09:30', end: '10:00' },
      { type: 'plan_date', taskRef: 't3', date: '2026-10-07' },
      { type: 'move_block', blockRef: 'b1', date: '2026-10-06', start: '18:00', end: '19:00' },
      { type: 'create_task', title: 'Due', dueDate: '2026-10-09' },
      { type: 'create_task', title: 'Also someday' },
      { type: 'create_task', title: 'Timed', plannedDate: '2026-10-07', start: '12:00', end: '13:00' },
    ]
    expect(inTimeOrder(actions).map((a) => ('title' in a && a.title) || ('taskRef' in a && a.taskRef) || a.type)).toEqual([
      'move_block',
      't3',
      't2',
      'Timed',
      't1',
      'Due',
      'Someday',
      'Also someday',
    ])
  })
})
