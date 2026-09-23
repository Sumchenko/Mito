import { createBrowserRouter } from 'react-router'
import { CalendarPage, MentorPage, StatsPage } from '@/features/placeholders'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TodayPage } from '@/features/today/TodayPage'
import { AppShell } from '@/shell/AppShell'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'tasks/:list?/:projectId?', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'mentor', element: <MentorPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
