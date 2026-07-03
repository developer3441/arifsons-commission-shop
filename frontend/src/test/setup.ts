import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { _resetOfflineDb } from '../offline/db'

// Reset DOM, stored language, and the offline IndexedDB between tests so the
// persisted per-user language (ADR-0030) and the durable write-queue (ADR-0031)
// don't leak across cases.
afterEach(async () => {
  cleanup()
  localStorage.clear()
  await _resetOfflineDb()
})
