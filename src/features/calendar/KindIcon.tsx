import { ArrowRepeatAllRegular, CalendarLtrRegular, DrinkCoffeeRegular } from '@fluentui/react-icons'
import type { TimeBlockKind } from '@/data'

/** The mark of a block that is not a task: events, breaks and routines differ by icon, not hue. */
export function KindIcon({ kind, className }: { kind: Exclude<TimeBlockKind, 'task'>; className?: string }) {
  const Icon = kind === 'break' ? DrinkCoffeeRegular : kind === 'routine' ? ArrowRepeatAllRegular : CalendarLtrRegular
  return <Icon className={className} aria-hidden />
}
