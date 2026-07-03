import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { OfflineContext } from './OfflineContext'
import { SyncStatus } from './SyncStatus'
import { enqueue, listQueued } from './queue'
import { cacheContacts } from './cache'
import { NewTrade } from '../screens/NewTrade'
import { IssueAdvance } from '../screens/IssueAdvance'
import { api, type ContactRecord, type ShopConfig } from '../api'

// Issue #60 — the offline write-queue's UI behaviour: a trade queues offline
// (idempotency key stops a double-post on replay), cash-outs are blocked offline,
// and the sync indicator shows the pending count (ADR-0031).

vi.mock('../api', () => ({
  api: { getConfig: vi.fn(), listContacts: vi.fn(), submitTrade: vi.fn(), issueAdvance: vi.fn(), getContact: vi.fn() },
}))

const farmer: ContactRecord = { id: 'farmer-ali', kind: 'zamindar', name: 'Ali', kattKgPerBag: 1.5, balance: 0 }
const buyer: ContactRecord = { id: 'buyer-mill', kind: 'pakka', name: 'Mill', balance: 0 }
const thekedar: ContactRecord = { id: 'thekedar-s', kind: 'thekedar', name: 'Saeed', balance: 0 }

type OfflineValue = React.ContextType<typeof OfflineContext>
const value = (o: Partial<NonNullable<OfflineValue>>): OfflineValue => ({
  online: true,
  pending: 0,
  syncing: false,
  syncedAt: 0,
  enqueueWrite: enqueue,
  syncNow: async () => {},
  refreshPending: async () => {},
  ...o,
})

function wrap(node: ReactNode, offline: Partial<NonNullable<OfflineValue>>) {
  return render(
    <LanguageProvider>
      <OfflineContext.Provider value={value(offline)}>
        <MemoryRouter>{node}</MemoryRouter>
      </OfflineContext.Provider>
    </LanguageProvider>,
  )
}

async function pick(triggerName: RegExp, optionText: string) {
  fireEvent.click(screen.getByRole('button', { name: triggerName }))
  fireEvent.click(await screen.findByText(optionText))
}

beforeEach(() => {
  localStorage.setItem('splitease.lang', 'en')
  vi.mocked(api.getConfig).mockResolvedValue({ kattKgPerBag: 1.5 } as ShopConfig)
  vi.mocked(api.submitTrade).mockReset().mockResolvedValue({} as never)
})

describe('offline UI (ADR-0031)', () => {
  it('queues a trade in IndexedDB when offline and shows a pending-sync badge — no submit call', async () => {
    await cacheContacts([farmer, buyer, thekedar]) // ContactPicker searches the cache offline
    wrap(<NewTrade />, { online: false })

    await pick(/select farmer/i, 'Ali')
    fireEvent.change(screen.getByLabelText(/Bag gross/i), { target: { value: '101.5' } })
    fireEvent.click(screen.getByRole('button', { name: /add bag/i }))
    await pick(/select buyer/i, 'Mill')
    fireEvent.change(screen.getByLabelText('Bags'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Rate/i), { target: { value: '2000' } })
    await pick(/select contractor/i, 'Saeed')

    fireEvent.click(screen.getByRole('button', { name: /submit trade/i }))

    // Nothing hits the network; the whole trade lands in the durable queue.
    await waitFor(async () => expect(await listQueued()).toHaveLength(1))
    const [op] = await listQueued()
    expect(op!.kind).toBe('trade')
    expect(vi.mocked(api.submitTrade)).not.toHaveBeenCalled()
    // Optimistic UI: provisional bill with a pending badge.
    expect(await screen.findByText(/Pending sync/i)).toBeInTheDocument()
    expect(screen.getByText(/as of last sync/i)).toBeInTheDocument()
  })

  it('blocks a cash-out (advance) offline with a needs-connection message', async () => {
    vi.mocked(api.listContacts).mockResolvedValue([farmer])
    vi.mocked(api.getContact).mockResolvedValue(farmer)
    wrap(<IssueAdvance />, { online: false })

    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '2000' } })
    expect(screen.getByText(/needs a live connection/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /post advance/i })).toBeDisabled()
    expect(vi.mocked(api.issueAdvance)).not.toHaveBeenCalled()
  })

  it('the sync indicator shows the pending count and offers "sync now"', async () => {
    const syncNow = vi.fn()
    wrap(<SyncStatus />, { online: true, pending: 3, syncNow })
    const btn = screen.getByRole('button', { name: /3 pending/i })
    fireEvent.click(btn)
    expect(syncNow).toHaveBeenCalled()
  })

  it('the sync indicator shows Offline when there is no connection', () => {
    wrap(<SyncStatus />, { online: false })
    expect(screen.getByText(/Offline/i)).toBeInTheDocument()
  })
})
