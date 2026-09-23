import { createBrowserRouter } from 'react-router'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { ZoomPage } from '@/features/calendar/zoom/ZoomPage'
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
      { path: 'calendar/zoom', element: <ZoomPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'mentor', element: <MentorPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
