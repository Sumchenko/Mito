import {
  bundleIcon,
  CalendarLtr20Filled,
  CalendarLtr20Regular,
  DataTrending20Filled,
  DataTrending20Regular,
  Home20Filled,
  Home20Regular,
  Settings20Filled,
  Settings20Regular,
  Sparkle20Filled,
  Sparkle20Regular,
  TaskListLtr20Filled,
  TaskListLtr20Regular,
  Timer20Filled,
  Timer20Regular,
} from '@fluentui/react-icons'
import type { FluentIcon } from '@fluentui/react-icons'

export interface NavItem {
  to: string
  labelKey: 'today' | 'tasks' | 'focus' | 'calendar' | 'stats' | 'mentor' | 'settings'
  Icon: FluentIcon
}

export const mainNav: NavItem[] = [
  { to: '/', labelKey: 'today', Icon: bundleIcon(Home20Filled, Home20Regular) },
  { to: '/tasks', labelKey: 'tasks', Icon: bundleIcon(TaskListLtr20Filled, TaskListLtr20Regular) },
  { to: '/focus', labelKey: 'focus', Icon: bundleIcon(Timer20Filled, Timer20Regular) },
  {
    to: '/calendar',
    labelKey: 'calendar',
    Icon: bundleIcon(CalendarLtr20Filled, CalendarLtr20Regular),
  },
  {
    to: '/stats',
    labelKey: 'stats',
    Icon: bundleIcon(DataTrending20Filled, DataTrending20Regular),
  },
  { to: '/mentor', labelKey: 'mentor', Icon: bundleIcon(Sparkle20Filled, Sparkle20Regular) },
]

export const footerNav: NavItem[] = [
  { to: '/settings', labelKey: 'settings', Icon: bundleIcon(Settings20Filled, Settings20Regular) },
]
