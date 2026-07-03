import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { AuthProvider } from '../auth/AuthContext'
import { OfflineContext } from '../offline/OfflineContext'
import { SyncCenter } from './SyncCenter'
import { enqueue, listPending, markNeedsAttention } from '../offline/queue'

// Issue #61 — the Sync Center surfaces a parked (needs-attention) item and lets
// the user discard it with a recorded reason (ADR-0031: never silently lost).

type OfflineValue = React.ContextType<typeof OfflineContext>
const value = (o: Partial<NonNullable<OfflineValue>>): OfflineValue => ({
  online: true, pending: 0, needsAttention: 1, syncing: false, authRequired: false, syncedAt: 0,
  enqueueWrite: async () => {}, syncNow: async () => {}, refreshPending: async () => {},
  retryItem: async () => {}, discardItem: async () => {}, ...o,
})

function wrap(node: ReactNode, offline: Partial<NonNullable<OfflineValue>>) {
  render(
    <LanguageProvider>
      <AuthProvider>
        <OfflineContext.Provider value={value(offline)}>
          <MemoryRouter>{node}</MemoryRouter>
        </OfflineContext.Provider>
      </AuthProvider>
    </LanguageProvider>,
  )
}

describe('SyncCenter (#61)', () => {
  beforeEach(() => localStorage.setItem('splitease.lang', 'en'))

  it('discards a parked item with a required reason', async () => {
    // Seed a needs-attention item directly in the durable queue.
    await enqueue({ id: 'trade-x', kind: 'trade', payload: {}, summary: 'Trade · Ali', createdAt: 1 })
    const seq = (await listPending())[0]!.seq!
    await markNeedsAttention(seq, '400: oversell')

    const discardItem = vi.fn()
    wrap(<SyncCenter />, { discardItem })

    // The parked item and its error are shown.
    expect(await screen.findByText('Trade · Ali')).toBeInTheDocument()
    expect(screen.getByText(/oversell/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Discard$/i }))
    // A reason is required.
    fireEvent.click(screen.getByRole('button', { name: /Confirm discard/i }))
    expect(screen.getByText(/Enter a reason/i)).toBeInTheDocument()
    expect(discardItem).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Reason for discarding/i), { target: { value: 'wrong buyer' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm discard/i }))
    await waitFor(() => expect(discardItem).toHaveBeenCalledWith(seq, 'wrong buyer'))
  })
})
