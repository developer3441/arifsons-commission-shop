import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Reset DOM and stored language between tests so the persisted per-user
// language (ADR-0030) doesn't leak across cases.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
