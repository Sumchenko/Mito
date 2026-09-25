import '@fontsource-variable/onest'
import './design/global.css'
import './i18n'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './app/router'
import { initAuth } from './sync/auth'

// Accounts and sync, when this build has a backend; otherwise Mito stays purely local.
initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </StrictMode>,
)
