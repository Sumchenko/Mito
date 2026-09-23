import { createBrowserRouter, Navigate } from 'react-router'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { MentorPage, StatsPage } from '@/features/placeholders'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { FocusPage } from '@/features/timer/FocusPage'
import { TodayPage } from '@/features/today/TodayPage'
import { AppShell } from '@/shell/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'tasks/:list?/:projectId?', element: <TasksPage /> },
      { path: 'focus', element: <FocusPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      // The zoom prototype became the calendar itself.
      { path: 'calendar/zoom', element: <Navigate to="/calendar" replace /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'mentor', element: <MentorPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
