import { describe, it, expect } from 'vitest'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { REVENUE_ID } from '../../src/domain/posting'

// Issue #2 — simplest single-buyer sale. One lot, one buyer, one line.
// Farmer-side commission + per-bag labour only; no Katt, advances, cess, or
// buyer-side commission. Governing: ADR-0012 (commission base = rate × payable
// maunds), ADR-0007 (labour to a contractor), ADR-0009 (whole PKR).

// Worked example: 100 maund × Rs 2000 = 200,000 gross; 2% commission = 4,000;
// 40 bags × Rs 50 labour = 2,000; net to farmer = 194,000.
const entry: TradeEntry = {
  id: 'trade-1',
  farmerId: 'farmer-ali',
  thekedarId: 'thekedar-1',
  bags: 40,
  line: { buyerId: 'buyer-mill', payableMaunds: 100, ratePerMaund: 2000 },
}
const config: TradeConfig = { farmerCommissionRate: 0.02, perBagLabour: 50 }

describe('single-buyer sale (issue #2)', () => {
  it('posts buyer -gross, farmer +net, thekedar +labour, revenue +commission', () => {
    const { postings } = postTradeEntry(entry, config)
    expect(postings).toEqual([
      { accountId: 'buyer-mill', amount: -200_000 },
      { accountId: 'farmer-ali', amount: 194_000 },
      { accountId: 'thekedar-1', amount: 2_000 },
      { accountId: REVENUE_ID, amount: 4_000 },
    ])
  })

  it('itemises the Kacha bill and returns one Pakka invoice', () => {
    const { farmerBill, buyerInvoice } = postTradeEntry(entry, config)
    expect(farmerBill).toEqual({ gross: 200_000, commission: 4_000, labour: 2_000, net: 194_000 })
    expect(buyerInvoice).toEqual({ buyerId: 'buyer-mill', gross: 200_000 })
  })

  it('the four postings sum to zero (balanced accrual)', () => {
    const { postings } = postTradeEntry(entry, config)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
  })
})

// Table-driven — the clean case plus a rounding case that exercises round-once
// at the line total (45.5 × 1099 = 50004.5 → 50,005; 2.5% → 1,250.1125 → 1,250).
describe('single-buyer sale — bill totals table (issue #2)', () => {
  const cases = [
    {
      name: 'clean',
      maunds: 100, rate: 2000, bags: 40, perBag: 50, comm: 0.02,
      gross: 200_000, commission: 4_000, labour: 2_000, net: 194_000,
    },
    {
      name: 'rounding',
      maunds: 45.5, rate: 1099, bags: 20, perBag: 50, comm: 0.025,
      gross: 50_005, commission: 1_250, labour: 1_000, net: 47_755,
    },
  ]

  it.each(cases)('$name: Kacha bill matches hand-computed totals', (c) => {
    const { farmerBill } = postTradeEntry(
      {
        id: 't',
        farmerId: 'f',
        thekedarId: 'th',
        bags: c.bags,
        line: { buyerId: 'b', payableMaunds: c.maunds, ratePerMaund: c.rate },
      },
      { farmerCommissionRate: c.comm, perBagLabour: c.perBag },
    )
    expect(farmerBill).toEqual({
      gross: c.gross,
      commission: c.commission,
      labour: c.labour,
      net: c.net,
    })
  })
})
