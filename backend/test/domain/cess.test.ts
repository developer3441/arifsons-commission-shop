import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { GOVERNMENT_ID, governmentAccount, ROKAR_ID } from '../../src/domain/posting'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { remitCess } from '../../src/domain/cash'

// Issue #7 — cess to the 7th (government) ledger, never revenue. Governing:
// ADR-0004 (cess is a liability pool, collection agent only), ADR-0010 (True
// Shop Value treats held cess as a liability).

const bags = Array.from({ length: 40 }, () => ({ grossKg: 101.5 }))
const baseConfig: TradeConfig = {
  farmerCommissionRate: 0.02,
  buyerCommissionRate: 0,
  perBagLabour: 50,
  perBagCharge: 0,
  bagBearer: 'farmer',
  labourBearer: 'farmer',
  kattKgPerBag: 1.5,
  cessRate: 0.01, // 1% of sale value = 2,000 on a 200,000 sale
}
const entry: TradeEntry = {
  id: 'trade-1',
  farmerId: 'farmer-ali',
  thekedarId: 'thekedar-1',
  lotBags: 40,
  lines: [{ buyerId: 'buyer-mill', bags, ratePerMaund: 2000 }],
}

describe('cess accrual on a sale line (issue #7)', () => {
  it('adds cess to the buyer Pakka invoice', () => {
    const { buyerInvoices } = postTradeEntry(entry, baseConfig)
    expect(buyerInvoices[0]!.cess).toBe(2_000)
    expect(buyerInvoices[0]!.total).toBe(202_000) // 200,000 sale + 2,000 cess
  })

  it('posts cess to the government ledger as a liability, never to revenue', () => {
    const { postings } = postTradeEntry(entry, baseConfig)
    expect(postings.find((p) => p.accountId === GOVERNMENT_ID)?.amount).toBe(2_000)
    // revenue only carries commission (+ bag charge if any) — no cess mixed in
    const revenuePosting = postings.find((p) => p.accountId === 'revenue')
    expect(revenuePosting?.amount).toBe(4_000) // farmer commission only, per baseConfig
  })

  it('does not affect the farmer bill at all', () => {
    const { farmerBill } = postTradeEntry(entry, baseConfig)
    expect(farmerBill.net).toBe(194_000)
  })

  it('every posting still sums to zero with cess in the mix', () => {
    const { postings } = postTradeEntry(entry, baseConfig)
    expect(postings.reduce((sum, p) => sum + p.amount, 0)).toBe(0)
  })

  it('zero cessRate posts no cess at all', () => {
    const cfg: TradeConfig = { ...baseConfig, cessRate: 0 }
    const { postings, buyerInvoices } = postTradeEntry(entry, cfg)
    expect(buyerInvoices[0]!.cess).toBe(0)
    expect(postings.find((p) => p.accountId === GOVERNMENT_ID)).toBeUndefined()
  })
})

describe('cess remittance (issue #7)', () => {
  it('lowers Rokar and zeroes the government ledger', () => {
    const entry = remitCess('remit-1', governmentAccount(), pkr(6_000))
    expect(entry.postings).toEqual([
      { accountId: ROKAR_ID, amount: -6_000 },
      { accountId: GOVERNMENT_ID, amount: -6_000 },
    ])
  })

  it('rejects a remittance when nothing is held', () => {
    expect(() => remitCess('remit-1', governmentAccount(), pkr(0))).toThrow()
  })
})
