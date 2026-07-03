import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { LanguageProvider } from '../i18n/LanguageProvider'
import { NewTrade } from './NewTrade'
import { api, type ContactRecord, type ShopConfig, type TradeResult } from '../api'

// Issue #54 (ADR-0032) — the New Trade flow composes a whole trade (farmer,
// each bag's weight, buyer lines, contractor) and submits it as ONE atomic
// request; entities are chosen via the ContactPicker, never a raw-id box.

vi.mock('../api', () => ({
  api: { getConfig: vi.fn(), listContacts: vi.fn(), submitTrade: vi.fn() },
}))

const farmer: ContactRecord = { id: 'farmer-ali', kind: 'zamindar', name: 'Ali', kattKgPerBag: 1.5, balance: 0 }
const buyer: ContactRecord = { id: 'buyer-mill', kind: 'pakka', name: 'Mill', balance: 0 }
const thekedar: ContactRecord = { id: 'thekedar-s', kind: 'thekedar', name: 'Saeed', balance: 0 }
const config: ShopConfig = {
  farmerCommissionRate: 0.02, buyerCommissionRate: 0, kattKgPerBag: 1.5, perBagLabour: 0,
  perBagCharge: 0, bagBearer: 'farmer', labourBearer: 'farmer', cessRate: 0,
}
const result: TradeResult = {
  entryId: 'e1', lotNumber: 7, farmerId: 'farmer-ali', thekedarId: 'thekedar-s', payableMaunds: 2.5,
  farmerBill: { gross: 5000, commission: 100, labour: 0, bagCharge: 0, net: 4900 },
  buyerInvoices: [{ buyerId: 'buyer-mill', saleValue: 5000, commission: 0, labourCharge: 0, bagCharge: 0, cess: 0, total: 5000 }],
  settlement: { debtRepaid: 0, heldSurplus: 4900, remainingDebt: 0, newBalance: 4900 },
}

const byKind: Record<string, ContactRecord[]> = { zamindar: [farmer], pakka: [buyer], thekedar: [thekedar] }

function renderTrade() {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <NewTrade />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

async function pick(triggerName: RegExp, optionText: string) {
  fireEvent.click(screen.getByRole('button', { name: triggerName }))
  fireEvent.click(await screen.findByText(optionText))
}

describe('NewTrade (atomic submission)', () => {
  beforeEach(() => {
    vi.mocked(api.getConfig).mockResolvedValue(config)
    vi.mocked(api.listContacts).mockImplementation((kind) => Promise.resolve(byKind[kind] ?? []))
    vi.mocked(api.submitTrade).mockReset().mockResolvedValue(result)
    localStorage.setItem('splitease.lang', 'en')
  })

  it('composes farmer + bags + buyer line + contractor and submits ONE atomic request', async () => {
    renderTrade()

    // Farmer via the picker (no raw-id box).
    await pick(/select farmer/i, 'Ali')

    // Weigh one bag.
    fireEvent.change(screen.getByLabelText(/Bag gross/i), { target: { value: '101.5' } })
    fireEvent.click(screen.getByRole('button', { name: /add bag/i }))

    // Buyer line: pick buyer, set bags + rate.
    await pick(/select buyer/i, 'Mill')
    fireEvent.change(screen.getByLabelText('Bags'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/Rate/i), { target: { value: '2000' } })

    // Contractor.
    await pick(/select contractor/i, 'Saeed')

    fireEvent.click(screen.getByRole('button', { name: /submit trade/i }))

    await waitFor(() =>
      expect(vi.mocked(api.submitTrade)).toHaveBeenCalledWith(
        expect.objectContaining({
          farmerId: 'farmer-ali',
          thekedarId: 'thekedar-s',
          bags: [{ grossKg: 101.5 }],
          lines: [{ buyerId: 'buyer-mill', bagCount: 1, ratePerMaund: 2000 }],
        }),
      ),
    )
    // The saved bill (with the server-assigned lot number) is shown.
    expect(await screen.findByText(/Lot #7/)).toBeInTheDocument()
  })

  it('shows a display-only payable-maund preview before submitting (server authoritative)', async () => {
    renderTrade()
    await pick(/select farmer/i, 'Ali')
    fireEvent.change(screen.getByLabelText(/Bag gross/i), { target: { value: '101.5' } })
    fireEvent.click(screen.getByRole('button', { name: /add bag/i }))
    // (101.5 − 1.5 Katt) / 40 = 2.50 maund
    expect(await screen.findByText(/2\.50/)).toBeInTheDocument()
  })
})
