import { describe, it, expect } from 'vitest'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { REVENUE_ID } from '../../src/domain/posting'

// Issue #2 (simplest single-buyer sale) + issue #3 (canonical weight pipeline).
// Governing: ADR-0012 (commission base = rate × payable maunds), ADR-0007
// (labour to a contractor), ADR-0009 (whole PKR), ADR-0002/0003 (gross kg per
// bag -> Katt -> payable maunds).

// Worked example: 40 bags at 101.5kg gross, Katt 1.5kg/bag -> payable 100kg
// each -> 4000kg total -> 100 maund. 100 maund × Rs 2000 = 200,000 gross;
// 2% commission = 4,000; 40 bags × Rs 50 labour = 2,000; net = 194,000.
const bags = Array.from({ length: 40 }, () => ({ grossKg: 101.5 }))
const entry: TradeEntry = {
  id: 'trade-1',
  farmerId: 'farmer-ali',
  thekedarId: 'thekedar-1',
  line: { buyerId: 'buyer-mill', bags, ratePerMaund: 2000 },
}
const config: TradeConfig = { farmerCommissionRate: 0.02, perBagLabour: 50, kattKgPerBag: 1.5 }

describe('single-buyer sale (issues #2, #3)', () => {
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
    const { farmerBill, buyerInvoice, payableMaunds } = postTradeEntry(entry, config)
    expect(farmerBill).toEqual({ gross: 200_000, commission: 4_000, labour: 2_000, net: 194_000 })
    expect(buyerInvoice).toEqual({ buyerId: 'buyer-mill', gross: 200_000 })
    expect(payableMaunds).toBe(100)
  })

  it('the four postings sum to zero (balanced accrual)', () => {
    const { postings } = postTradeEntry(entry, config)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
  })
})

describe('weight pipeline in the trade engine (issue #3)', () => {
  it('handles variable-weight bags, not just uniform ones', () => {
    const varied: TradeEntry = {
      id: 't-varied',
      farmerId: 'farmer-b',
      thekedarId: 'th-1',
      line: {
        buyerId: 'buyer-x',
        bags: [{ grossKg: 41.5 }, { grossKg: 45 }, { grossKg: 38 }],
        ratePerMaund: 1000,
      },
      // payable: 40, 43.5, 36.5 = 120kg / 40 = 3 maund
    }
    const cfg: TradeConfig = { farmerCommissionRate: 0, perBagLabour: 0, kattKgPerBag: 1.5 }
    const { payableMaunds, farmerBill } = postTradeEntry(varied, cfg)
    expect(payableMaunds).toBe(3)
    expect(farmerBill.gross).toBe(3_000)
  })

  it('clamps a bag lighter than the katt deduction at zero payable kg', () => {
    const lightBag: TradeEntry = {
      id: 't-light',
      farmerId: 'farmer-c',
      thekedarId: 'th-1',
      line: { buyerId: 'buyer-y', bags: [{ grossKg: 41.5 }, { grossKg: 1 }], ratePerMaund: 1000 },
      // payable: 40, 0(clamped) = 40kg / 40 = 1 maund
    }
    const cfg: TradeConfig = { farmerCommissionRate: 0, perBagLabour: 0, kattKgPerBag: 1.5 }
    const { payableMaunds } = postTradeEntry(lightBag, cfg)
    expect(payableMaunds).toBe(1)
  })

  it('per-invoice Katt override beats the global default', () => {
    const cfg: TradeConfig = { farmerCommissionRate: 0, perBagLabour: 0, kattKgPerBag: 1.5 }
    const withOverride: TradeEntry = {
      id: 't-override',
      farmerId: 'farmer-d',
      thekedarId: 'th-1',
      line: { buyerId: 'buyer-z', bags: [{ grossKg: 42 }], ratePerMaund: 40, kattKgPerBag: 2 },
      // override katt=2 -> payable 40kg -> 1 maund (vs 40.5/40=1.0125 with global 1.5)
    }
    expect(postTradeEntry(withOverride, cfg).payableMaunds).toBe(1)
  })

  it('per-customer Katt override beats the global default when no per-invoice override is set', () => {
    const cfg: TradeConfig = {
      farmerCommissionRate: 0,
      perBagLabour: 0,
      kattKgPerBag: 1.5,
      customerKattKgPerBag: { 'farmer-e': 2 },
    }
    const entryForCustomer: TradeEntry = {
      id: 't-customer',
      farmerId: 'farmer-e',
      thekedarId: 'th-1',
      line: { buyerId: 'buyer-z', bags: [{ grossKg: 42 }], ratePerMaund: 40 },
    }
    expect(postTradeEntry(entryForCustomer, cfg).payableMaunds).toBe(1)
  })
})

// Table-driven — the clean case plus a rounding case that exercises round-once
// at the line total (45.5 × 1099 = 50004.5 → 50,005; 2.5% → 1,250.1125 → 1,250).
describe('single-buyer sale — bill totals table (issues #2, #3)', () => {
  const cases = [
    {
      name: 'clean',
      maunds: 100, rate: 2000, bagCount: 40, perBag: 50, comm: 0.02,
      gross: 200_000, commission: 4_000, labour: 2_000, net: 194_000,
    },
    {
      name: 'rounding',
      maunds: 45.5, rate: 1099, bagCount: 20, perBag: 50, comm: 0.025,
      gross: 50_005, commission: 1_250, labour: 1_000, net: 47_755,
    },
  ]

  it.each(cases)('$name: Kacha bill matches hand-computed totals', (c) => {
    // katt=0 and gross kg chosen so payable maunds equals the case's target exactly.
    const totalKg = c.maunds * 40
    const perBagKg = totalKg / c.bagCount
    const bags = Array.from({ length: c.bagCount }, () => ({ grossKg: perBagKg }))
    const { farmerBill } = postTradeEntry(
      { id: 't', farmerId: 'f', thekedarId: 'th', line: { buyerId: 'b', bags, ratePerMaund: c.rate } },
      { farmerCommissionRate: c.comm, perBagLabour: c.perBag, kattKgPerBag: 0 },
    )
    expect(farmerBill).toEqual({
      gross: c.gross,
      commission: c.commission,
      labour: c.labour,
      net: c.net,
    })
  })
})
