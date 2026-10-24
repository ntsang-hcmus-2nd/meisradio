import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './locales'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MotionRoot } from './components/motion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <MotionRoot>
          <App />
        </MotionRoot>
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>
)
