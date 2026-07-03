import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import './index' // initialise the shared i18n instance
import { LanguageProvider } from './LanguageProvider'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

// Switching language flips BOTH the visible strings and the document direction
// (ADR-0030). This is the regression that CI would otherwise never catch.
describe('language switch', () => {
  it('defaults to Urdu/RTL and flips to English/LTR on toggle', async () => {
    render(
      <LanguageProvider>
        <LanguageSwitcher />
      </LanguageProvider>,
    )

    // Default is Urdu (ADR-0030) → document direction is RTL.
    expect(document.documentElement.lang).toBe('ur')
    expect(document.documentElement.dir).toBe('rtl')

    // Toggle to English → direction flips to LTR.
    await userEvent.click(screen.getByRole('button', { name: 'English' }))
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
})
