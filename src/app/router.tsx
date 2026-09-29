import { createBrowserRouter, Navigate } from 'react-router'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { GoalPage } from '@/features/mentor/goal/GoalPage'
import { MentorPage } from '@/features/mentor/MentorPage'
import { StatsPage } from '@/features/stats/StatsPage'
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
      // Email sign-in links land here; the token is verified by initAuth().
      { path: 'auth/confirm', element: <Navigate to="/settings" replace /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'mentor', element: <MentorPage /> },
      { path: 'mentor/goal/:goalId', element: <GoalPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
