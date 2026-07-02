import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-nastaliq-urdu/400.css'
import '@fontsource/noto-nastaliq-urdu/700.css'
import './index.css'
import './i18n'
import { LanguageProvider } from './i18n/LanguageProvider'
import { App } from './App'

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)
