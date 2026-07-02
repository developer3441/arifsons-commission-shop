import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { Dashboard } from './Dashboard'
import { api, type DashboardSnapshot } from '../api'

vi.mock('../api', () => ({ api: { dashboard: vi.fn() } }))

const snapshot: DashboardSnapshot = {
  cashInHand: 200000,
  trueShopValue: 350000,
  breakdown: {
    cash: 200000,
    buyerReceivables: 0,
    farmerReceivables: 0,
    godownValue: 0,
    bardanaOutValue: 0,
    farmerPayoutsOwed: 0,
    outstandingLabour: 0,
    cessHeld: 0,
    total: 350000,
  },
  reconciliation: { trueShopValue: 350000, expected: 350000, drift: 0, reconciles: true },
  ledgers: [
    { kind: 'rokar', balance: 200000 },
    { kind: 'zamindar', balance: -50000 },
  ],
}

function renderDashboard() {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('Dashboard', () => {
  beforeEach(() => vi.mocked(api.dashboard).mockReset())

  it('renders the two hero pillars with Western-digit amounts on success', async () => {
    vi.mocked(api.dashboard).mockResolvedValue(snapshot)
    renderDashboard()
    // amounts are language-independent (Western digits, ADR-0030)
    expect(await screen.findByText('PKR 350,000')).toBeInTheDocument() // True Shop Value (unique)
    expect(screen.getAllByText('PKR 200,000').length).toBeGreaterThan(0) // Cash in Hand + Rokar card
  })

  it('shows a loading state first, then the data', async () => {
    let resolve!: (v: DashboardSnapshot) => void
    vi.mocked(api.dashboard).mockReturnValue(new Promise<DashboardSnapshot>((r) => (resolve = r)))
    renderDashboard()
    // before the promise settles: the loading indicator, no data
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('PKR 350,000')).not.toBeInTheDocument()
    // settle it so nothing dangles, then the data appears
    resolve(snapshot)
    expect(await screen.findByText('PKR 350,000')).toBeInTheDocument()
  })
})
