import { addDays, type LocalDate, type Priority } from '@/data'

/*
 * Quick-add parser: turns "Отчёт завтра 2ч #работа !!! до пятницы" into structured fields.
 * Understands Russian and English regardless of the UI language. Only the first match of each
 * kind is taken; anything unrecognised stays in the title. Pure — `today` is passed in.
 */

export type PartKind = 'project' | 'tag' | 'priority' | 'estimate' | 'planned' | 'due'

export interface Part {
  kind: PartKind
  /** The matched source text, e.g. "до пятницы". */
  text: string
  start: number
  end: number
}

export interface ParsedTask {
  title: string
  projectName?: string
  tagNames: string[]
  priority?: Priority
  estimateMin?: number
  plannedDate?: LocalDate
  dueDate?: LocalDate
  parts: Part[]
}

// \b does not understand Cyrillic, so word edges are expressed with Unicode lookarounds.
const L = '(?<![\\p{L}\\p{N}])'
const R = '(?![\\p{L}\\p{N}])'

/** Weekday stems → JS weekday index (0 = Sunday). Longer alternatives first. */
const WEEKDAYS: [string, number][] = [
  ['понедельник[аеу]?|пн|monday|mon', 1],
  ['вторник[аеу]?|вт|tuesday|tue|tues', 2],
  ['сред[аеуы]|ср|wednesday|wed', 3],
  ['четверг[аеу]?|чт|thursday|thu|thurs', 4],
  ['пятниц[аеуы]|пт|friday|fri', 5],
  ['суббот[аеуы]|сб|saturday|sat', 6],
  ['воскресень[еяю]|вс|sunday|sun', 0],
]

const WEEKDAY_SRC = WEEKDAYS.map(([s]) => s).join('|')
const DATE_SRC = [
  'сегодня|today',
  'послезавтра',
  'завтра|tomorrow|tmr',
  `(?:через|in)\\s+\\d{1,3}\\s+(?:дн(?:я|ей)|день|days?)`,
  '\\d{1,2}\\.\\d{1,2}(?:\\.\\d{2,4})?',
  WEEKDAY_SRC,
].join('|')

const RE = {
  project: new RegExp(`(?<!\\S)#([\\p{L}\\p{N}_-]+)`, 'u'),
  tag: new RegExp(`(?<!\\S)@([\\p{L}\\p{N}_-]+)`, 'u'),
  priority: /(?<!\S)(!{1,3})(?!\S)/u,
  estimate: new RegExp(
    `${L}(?:(\\d+(?:[.,]\\d+)?)\\s?(?:ч|час(?:а|ов)?|h|hrs?)` +
      `(?:\\s?(\\d+)\\s?(?:м|мин|минут[аы]?|m|min|mins))?` +
      `|(\\d+)\\s?(?:м|мин|минут[аы]?|m|min|mins))${R}`,
    'iu',
  ),
  due: new RegExp(`${L}(?:до|due|by)\\s+(${DATE_SRC})${R}`, 'iu'),
  planned: new RegExp(`${L}(?:(?:во?|on)\\s+)?(${DATE_SRC})${R}`, 'iu'),
}

function localDate(y: number, m: number, d: number): LocalDate | undefined {
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return undefined
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as LocalDate
}

/** Resolves a date phrase relative to `today`. Weekdays mean the nearest one, today included. */
export function resolveDate(phrase: string, today: LocalDate): LocalDate | undefined {
  const p = phrase.toLowerCase()
  if (/^(сегодня|today)$/.test(p)) return today
  if (p === 'послезавтра') return addDays(today, 2)
  if (/^(завтра|tomorrow|tmr)$/.test(p)) return addDays(today, 1)

  const inDays = p.match(/^(?:через|in)\s+(\d{1,3})/)
  if (inDays) return addDays(today, Number(inDays[1]))

  const dm = p.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
  if (dm) {
    const [ty] = today.split('-').map(Number) as [number]
    const day = Number(dm[1])
    const month = Number(dm[2])
    if (dm[3]) {
      const year = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])
      return localDate(year, month, day)
    }
    const thisYear = localDate(ty, month, day)
    // A day-month that already passed this year means next year.
    return thisYear && thisYear < today ? localDate(ty + 1, month, day) : thisYear
  }

  for (const [stems, weekday] of WEEKDAYS) {
    if (new RegExp(`^(?:${stems})$`, 'iu').test(p)) {
      const [y, m, d] = today.split('-').map(Number) as [number, number, number]
      const current = new Date(y, m - 1, d).getDay()
      return addDays(today, (weekday - current + 7) % 7)
    }
  }
  return undefined
}

function parseEstimate(match: RegExpMatchArray): number | undefined {
  const [, hours, hourMinutes, minutesOnly] = match
  const total = minutesOnly
    ? Number(minutesOnly)
    : Math.round(Number(hours!.replace(',', '.')) * 60) + Number(hourMinutes ?? 0)
  return total > 0 && total <= 24 * 60 ? total : undefined
}

export function parseQuickAdd(input: string, today: LocalDate): ParsedTask {
  const result: ParsedTask = { title: '', tagNames: [], parts: [] }
  // Matched spans are blanked out (same length) so later patterns keep valid offsets.
  let rest = input

  const take = (kind: PartKind, match: RegExpMatchArray) => {
    const start = match.index!
    const end = start + match[0].length
    result.parts.push({ kind, text: input.slice(start, end), start, end })
    rest = rest.slice(0, start) + ' '.repeat(end - start) + rest.slice(end)
  }

  // Order matters: "до пятницы" must be claimed as a deadline before "пятницы" as a plan.
  const due = rest.match(RE.due)
  if (due) {
    const date = resolveDate(due[1]!, today)
    if (date) {
      result.dueDate = date
      take('due', due)
    }
  }

  const planned = rest.match(RE.planned)
  if (planned) {
    const date = resolveDate(planned[1]!, today)
    if (date) {
      result.plannedDate = date
      take('planned', planned)
    }
  }

  const estimate = rest.match(RE.estimate)
  if (estimate) {
    const minutes = parseEstimate(estimate)
    if (minutes) {
      result.estimateMin = minutes
      take('estimate', estimate)
    }
  }

  const priority = rest.match(RE.priority)
  if (priority) {
    result.priority = priority[1]!.length as Priority
    take('priority', priority)
  }

  const project = rest.match(RE.project)
  if (project) {
    result.projectName = project[1]!.replace(/_/g, ' ')
    take('project', project)
  }

  let tag: RegExpMatchArray | null
  while ((tag = rest.match(RE.tag))) {
    const name = tag[1]!.replace(/_/g, ' ')
    if (!result.tagNames.includes(name)) result.tagNames.push(name)
    take('tag', tag)
  }

  result.title = rest.replace(/\s+/g, ' ').trim()
  result.parts.sort((a, b) => a.start - b.start)
  return result
}

/** Loose name comparison for matching `#проект` against existing names. */
export const normalizeName = (name: string) =>
  name.toLowerCase().replace(/ё/g, 'е').replace(/[\s_-]+/g, '')
