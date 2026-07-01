import { describe, it, expect } from 'vitest'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { REVENUE_ID } from '../../src/domain/posting'

// Issue #2 (simplest single-buyer sale) + #3 (canonical weight pipeline) +
// #6 (both-side commission, configurable cost bearer).
// Governing: ADR-0012 (commission both sides), ADR-0001 (cost bearer),
// ADR-0007 (labour to a contractor), ADR-0009 (whole PKR),
// ADR-0002/0003 (gross kg per bag -> Katt -> payable maunds).

// Worked example: 40 bags at 101.5kg gross, Katt 1.5kg/bag -> payable 100kg
// each -> 4000kg total -> 100 maund. 100 maund × Rs 2000 = 200,000 sale value;
// 2% farmer commission = 4,000; 40 bags × Rs 50 labour = 2,000 (farmer-borne
// by default); net = 194,000. No buyer-side commission/charges by default.
const bags = Array.from({ length: 40 }, () => ({ grossKg: 101.5 }))
const baseConfig: TradeConfig = {
  farmerCommissionRate: 0.02,
  buyerCommissionRate: 0,
  perBagLabour: 50,
  perBagCharge: 0,
  bagBearer: 'farmer',
  labourBearer: 'farmer',
  kattKgPerBag: 1.5,
}
const entry: TradeEntry = {
  id: 'trade-1',
  farmerId: 'farmer-ali',
  thekedarId: 'thekedar-1',
  line: { buyerId: 'buyer-mill', bags, ratePerMaund: 2000 },
}

describe('single-buyer sale (issues #2, #3, #6 defaults)', () => {
  it('posts buyer -total, farmer +net, thekedar +labour, revenue +commission', () => {
    const { postings } = postTradeEntry(entry, baseConfig)
    expect(postings).toEqual([
      { accountId: 'buyer-mill', amount: -200_000 },
      { accountId: 'farmer-ali', amount: 194_000 },
      { accountId: 'thekedar-1', amount: 2_000 },
      { accountId: REVENUE_ID, amount: 4_000 },
    ])
  })

  it('itemises the Kacha bill and Pakka invoice', () => {
    const { farmerBill, buyerInvoice, payableMaunds } = postTradeEntry(entry, baseConfig)
    expect(farmerBill).toEqual({ gross: 200_000, commission: 4_000, labour: 2_000, bagCharge: 0, net: 194_000 })
    expect(buyerInvoice).toEqual({
      buyerId: 'buyer-mill',
      saleValue: 200_000,
      commission: 0,
      labourCharge: 0,
      bagCharge: 0,
      total: 200_000,
    })
    expect(payableMaunds).toBe(100)
  })

  it('the four postings sum to zero (balanced accrual)', () => {
    const { postings } = postTradeEntry(entry, baseConfig)
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
    const cfg: TradeConfig = { ...baseConfig, farmerCommissionRate: 0, perBagLabour: 0 }
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
    const cfg: TradeConfig = { ...baseConfig, farmerCommissionRate: 0, perBagLabour: 0 }
    const { payableMaunds } = postTradeEntry(lightBag, cfg)
    expect(payableMaunds).toBe(1)
  })

  it('per-invoice Katt override beats the global default', () => {
    const cfg: TradeConfig = { ...baseConfig, farmerCommissionRate: 0, perBagLabour: 0 }
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
      ...baseConfig,
      farmerCommissionRate: 0,
      perBagLabour: 0,
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

describe('both-side commission and configurable cost bearer (issue #6)', () => {
  it('buyer-side commission posts to revenue and the Pakka invoice, farmer unaffected', () => {
    const cfg: TradeConfig = { ...baseConfig, buyerCommissionRate: 0.01 } // +1% on 200,000 = 2,000
    const { farmerBill, buyerInvoice, postings } = postTradeEntry(entry, cfg)
    expect(farmerBill.net).toBe(194_000) // unchanged — buyer-side commission doesn't touch the farmer
    expect(buyerInvoice).toEqual({
      buyerId: 'buyer-mill',
      saleValue: 200_000,
      commission: 2_000,
      labourCharge: 0,
      bagCharge: 0,
      total: 202_000,
    })
    expect(postings).toEqual([
      { accountId: 'buyer-mill', amount: -202_000 },
      { accountId: 'farmer-ali', amount: 194_000 },
      { accountId: 'thekedar-1', amount: 2_000 },
      { accountId: REVENUE_ID, amount: 6_000 }, // 4,000 farmer commission + 2,000 buyer commission
    ])
  })

  it('labourBearer = buyer moves the labour charge onto the Pakka invoice and nets the farmer debt to zero', () => {
    const cfg: TradeConfig = { ...baseConfig, labourBearer: 'buyer' }
    const { farmerBill, buyerInvoice, postings } = postTradeEntry(entry, cfg)
    expect(farmerBill).toEqual({ gross: 200_000, commission: 4_000, labour: 0, bagCharge: 0, net: 196_000 })
    expect(buyerInvoice.total).toBe(202_000) // 200,000 sale + 2,000 labour charge
    // thekedar is still paid in full regardless of who funds it
    expect(postings.find((p) => p.accountId === 'thekedar-1')?.amount).toBe(2_000)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
  })

  it('bagBearer = buyer moves the bag charge onto the Pakka invoice and nets the farmer debt to zero', () => {
    const cfg: TradeConfig = { ...baseConfig, perBagCharge: 20, bagBearer: 'buyer' } // 40 bags x 20 = 800
    const { farmerBill, buyerInvoice, postings } = postTradeEntry(entry, cfg)
    expect(farmerBill).toEqual({ gross: 200_000, commission: 4_000, labour: 2_000, bagCharge: 0, net: 194_000 })
    expect(buyerInvoice.bagCharge).toBe(800)
    expect(buyerInvoice.total).toBe(200_800)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
  })

  it('farmer-borne bag charge deducts from the Kacha bill instead', () => {
    const cfg: TradeConfig = { ...baseConfig, perBagCharge: 20, bagBearer: 'farmer' }
    const { farmerBill, buyerInvoice } = postTradeEntry(entry, cfg)
    expect(farmerBill.bagCharge).toBe(800)
    expect(farmerBill.net).toBe(200_000 - 4_000 - 2_000 - 800)
    expect(buyerInvoice.bagCharge).toBe(0)
    expect(buyerInvoice.total).toBe(200_000)
  })

  it('per-invoice bearer override beats the global default', () => {
    const cfg: TradeConfig = { ...baseConfig } // global default: farmer
    const overridden: TradeEntry = {
      ...entry,
      line: { ...entry.line, labourBearer: 'buyer' },
    }
    const { farmerBill, buyerInvoice } = postTradeEntry(overridden, cfg)
    expect(farmerBill.labour).toBe(0)
    expect(buyerInvoice.labourCharge).toBe(2_000)
  })

  it('per-customer bearer override beats the global default when no per-invoice override is set', () => {
    const cfg: TradeConfig = { ...baseConfig, customerLabourBearer: { 'farmer-ali': 'buyer' } }
    const { farmerBill, buyerInvoice } = postTradeEntry(entry, cfg)
    expect(farmerBill.labour).toBe(0)
    expect(buyerInvoice.labourCharge).toBe(2_000)
  })

  it('every combination still balances to zero (farmer- and buyer-borne, both charges, both commissions)', () => {
    const cfg: TradeConfig = {
      farmerCommissionRate: 0.02,
      buyerCommissionRate: 0.01,
      perBagLabour: 50,
      perBagCharge: 20,
      bagBearer: 'buyer',
      labourBearer: 'farmer',
      kattKgPerBag: 1.5,
    }
    const { postings } = postTradeEntry(entry, cfg)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
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
    const lineBags = Array.from({ length: c.bagCount }, () => ({ grossKg: perBagKg }))
    const cfg: TradeConfig = {
      farmerCommissionRate: c.comm,
      buyerCommissionRate: 0,
      perBagLabour: c.perBag,
      perBagCharge: 0,
      bagBearer: 'farmer',
      labourBearer: 'farmer',
      kattKgPerBag: 0,
    }
    const { farmerBill } = postTradeEntry(
      { id: 't', farmerId: 'f', thekedarId: 'th', line: { buyerId: 'b', bags: lineBags, ratePerMaund: c.rate } },
      cfg,
    )
    expect(farmerBill).toEqual({
      gross: c.gross,
      commission: c.commission,
      labour: c.labour,
      bagCharge: 0,
      net: c.net,
    })
  })
})
