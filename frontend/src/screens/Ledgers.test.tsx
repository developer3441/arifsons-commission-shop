import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { Ledgers } from './Ledgers'
import { api } from '../api'

// Issue #56 — the 7-ledger grid drills grid → accounts → statement, all
// read-only projections (ADR-0010). Amounts are Western-digit (ADR-0030).
vi.mock('../api', () => ({
  api: { listLedgers: vi.fn(), listLedgerAccounts: vi.fn(), getAccountStatement: vi.fn() },
}))

function renderScreen() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <Ledgers />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('Ledgers', () => {
  beforeEach(() => {
    localStorage.setItem('splitease.lang', 'en')
    vi.mocked(api.listLedgers).mockReset().mockResolvedValue([
      { kind: 'rokar', balance: 200000 },
      { kind: 'zamindar', balance: -50000 },
    ])
    vi.mocked(api.listLedgerAccounts).mockReset().mockResolvedValue([
      { id: 'farmer-ali', name: 'Ali', balance: -50000 },
    ])
    vi.mocked(api.getAccountStatement).mockReset().mockResolvedValue({
      accountId: 'farmer-ali',
      balance: -50000,
      entries: [{ entryId: 'e1', kind: 'trade', amount: -50000, balanceAfter: -50000 }],
    })
  })

  it('drills grid → accounts → statement', async () => {
    renderScreen()
    // grid: colour-coded ledger cards with Western-digit amounts
    expect(await screen.findByText('PKR 200,000')).toBeInTheDocument()
    const rokar = screen.getByText(/Rokar/i)

    fireEvent.click(rokar)
    expect(await screen.findByText('Ali')).toBeInTheDocument() // accounts level
    expect(vi.mocked(api.listLedgerAccounts)).toHaveBeenCalledWith('rokar')

    fireEvent.click(screen.getByText('Ali'))
    // statement level: the localized entry kind ("Sale") appears
    expect(await screen.findByText('Sale')).toBeInTheDocument()
    expect(vi.mocked(api.getAccountStatement)).toHaveBeenCalledWith('farmer-ali')
  })
})
