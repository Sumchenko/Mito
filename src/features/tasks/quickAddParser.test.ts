import { describe, expect, it } from 'vitest'
import { parseQuickAdd, resolveDate } from './quickAddParser'

// 2026-09-23 is a Wednesday.
const today = '2026-09-23'
const parse = (s: string) => parseQuickAdd(s, today)

describe('parseQuickAdd', () => {
  it('leaves plain titles alone', () => {
    expect(parse('  Купить   молоко ')).toMatchObject({ title: 'Купить молоко', parts: [] })
  })

  it('parses the full example', () => {
    const r = parse('Отчёт завтра 2ч #работа !!! до пятницы @срочно')
    expect(r).toMatchObject({
      title: 'Отчёт',
      plannedDate: '2026-09-24',
      dueDate: '2026-09-25',
      estimateMin: 120,
      projectName: 'работа',
      priority: 3,
      tagNames: ['срочно'],
    })
    expect(r.parts.map((p) => p.kind)).toEqual([
      'planned',
      'estimate',
      'project',
      'priority',
      'due',
      'tag',
    ])
  })

  it('understands English', () => {
    expect(parse('Write report tomorrow 45min #work !! due fri')).toMatchObject({
      title: 'Write report',
      plannedDate: '2026-09-24',
      dueDate: '2026-09-25',
      estimateMin: 45,
      projectName: 'work',
      priority: 2,
    })
  })

  it('parses estimate formats', () => {
    expect(parse('a 1ч30м').estimateMin).toBe(90)
    expect(parse('a 1.5ч').estimateMin).toBe(90)
    expect(parse('a 1,5 ч').estimateMin).toBe(90)
    expect(parse('a 30 минут').estimateMin).toBe(30)
    expect(parse('a 2 часа').estimateMin).toBe(120)
    expect(parse('a 2h').estimateMin).toBe(120)
  })

  it('does not eat numbers or words that only look like tokens', () => {
    expect(parse('Прочитать 5 глав').title).toBe('Прочитать 5 глав')
    expect(parse('Сегодняшние дела').plannedDate).toBeUndefined()
    expect(parse('Позвонить маме').parts).toEqual([])
    expect(parse('email@example.com').tagNames).toEqual([])
    expect(parse('C# курс').projectName).toBeUndefined()
  })

  it('handles "в/во" before weekdays and the due-vs-planned order', () => {
    expect(parse('Встреча во вторник').plannedDate).toBe('2026-09-29')
    expect(parse('Сдать в пятницу до воскресенья')).toMatchObject({
      plannedDate: '2026-09-25',
      dueDate: '2026-09-27',
      title: 'Сдать',
    })
  })

  it('collects several tags and supports underscores as spaces', () => {
    expect(parse('x @a @b @a #мой_проект')).toMatchObject({
      tagNames: ['a', 'b'],
      projectName: 'мой проект',
    })
  })

  it('keeps the title non-empty only from remaining words', () => {
    expect(parse('завтра 2ч').title).toBe('')
  })
})

describe('resolveDate', () => {
  it('resolves relative words', () => {
    expect(resolveDate('сегодня', today)).toBe('2026-09-23')
    expect(resolveDate('послезавтра', today)).toBe('2026-09-25')
    expect(resolveDate('через 10 дней', today)).toBe('2026-10-03')
    expect(resolveDate('in 1 day', today)).toBe('2026-09-24')
  })

  it('treats a weekday as the nearest one, today included', () => {
    expect(resolveDate('среда', today)).toBe('2026-09-23')
    expect(resolveDate('пн', today)).toBe('2026-09-28')
  })

  it('rolls past day-month dates into next year and rejects impossible ones', () => {
    expect(resolveDate('01.10', today)).toBe('2026-10-01')
    expect(resolveDate('01.02', today)).toBe('2027-02-01')
    expect(resolveDate('31.02', today)).toBeUndefined()
    expect(resolveDate('05.01.27', today)).toBe('2027-01-05')
  })
})
