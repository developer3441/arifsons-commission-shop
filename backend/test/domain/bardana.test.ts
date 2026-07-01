import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { zamindarAccount, rokarAccount, balanceOf, type Entry } from '../../src/domain/posting'
import {
  lendBardana,
  resolveBardanaLoan,
  bardanaLoanValue,
  totalBardanaOutValue,
  type BardanaLoan,
} from '../../src/domain/bardana'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'

// Issue #10 — bardana lending and asset tracking. Governing: ADR-0001 (cost
// bearer), ADR-0010 (bags lent out are an asset, not a loss).

describe('lending bardana (issue #10)', () => {
  it('debits the farmer and values the loan at the configured empty-bag rate', () => {
    const farmer = zamindarAccount('farmer-ali')
    const { entry, loan } = lendBardana('loan-1', farmer, 5, pkr(100))

    expect(entry.postings).toEqual([{ accountId: 'farmer-ali', amount: -500 }])
    expect(loan).toEqual({ farmerId: 'farmer-ali', bagsOut: 5, bagValue: 100 })
    expect(bardanaLoanValue(loan)).toBe(500)
  })

  it('never touches Rokar — lending bags is not a cash movement', () => {
    const farmer = zamindarAccount('farmer-ali')
    const { entry } = lendBardana('loan-1', farmer, 5, pkr(100))
    expect(entry.postings.some((p) => p.accountId === 'rokar')).toBe(false)
  })

  it('rejects lending to a non-farmer account', () => {
    expect(() => lendBardana('loan-1', rokarAccount(), 5, pkr(100))).toThrow()
  })

  it('rejects lending a non-positive number of bags', () => {
    expect(() => lendBardana('loan-1', zamindarAccount('farmer-ali'), 0, pkr(100))).toThrow()
  })

  it('True Shop Value sums bardana-out across multiple farmers as one asset term', () => {
    const loans: BardanaLoan[] = [
      { farmerId: 'farmer-1', bagsOut: 5, bagValue: pkr(100) },
      { farmerId: 'farmer-2', bagsOut: 10, bagValue: pkr(100) },
    ]
    expect(totalBardanaOutValue(loans)).toBe(1_500)
  })
})

describe('resolving a bardana loan on a later sale (issue #10)', () => {
  const config: TradeConfig = {
    farmerCommissionRate: 0,
    buyerCommissionRate: 0,
    perBagLabour: 0,
    perBagCharge: 100, // matches the loan's bagValue — this sale settles the bardana
    bagBearer: 'farmer',
    labourBearer: 'farmer',
    kattKgPerBag: 0,
    cessRate: 0,
  }
  const saleEntry: TradeEntry = {
    id: 'trade-1',
    farmerId: 'farmer-ali',
    thekedarId: 'thekedar-1',
    lotBags: 5,
    lines: [{ buyerId: 'buyer-mill', bags: Array.from({ length: 5 }, () => ({ grossKg: 40 })), ratePerMaund: 1000 }],
    // 5 bags x 1 maund each = 5 maund x 1000 = 5,000 sale value; 5 bags x 100 bagCharge = 500
  }

  it('farmer-borne: the resolved debt ends up the same as if charged once, at lending', () => {
    const farmer = zamindarAccount('farmer-ali')
    const { entry: loanEntry, loan } = lendBardana('loan-1', farmer, 5, pkr(100))

    const resolution = resolveBardanaLoan('resolve-1', loan)
    const { postings: salePostings, farmerBill } = postTradeEntry(saleEntry, { ...config, bagBearer: 'farmer' })

    const stream: Entry[] = [
      loanEntry,
      resolution,
      { id: 'trade-1', kind: 'trade', postings: salePostings },
    ]

    // farmer's bag-related debt nets to exactly one bagValue charge, not double-counted
    expect(farmerBill.bagCharge).toBe(500)
    expect(balanceOf(stream, 'farmer-ali')).toBe(farmerBill.net) // -500 (loan) +500 (resolution) + net
  })

  it("buyer-borne: the sale nets the farmer's bardana debt fully to zero", () => {
    const farmer = zamindarAccount('farmer-ali')
    const { entry: loanEntry, loan } = lendBardana('loan-1', farmer, 5, pkr(100))

    const resolution = resolveBardanaLoan('resolve-1', loan)
    const { postings: salePostings, farmerBill, buyerInvoices } = postTradeEntry(saleEntry, {
      ...config,
      bagBearer: 'buyer',
    })

    const stream: Entry[] = [
      loanEntry,
      resolution,
      { id: 'trade-1', kind: 'trade', postings: salePostings },
    ]

    expect(farmerBill.bagCharge).toBe(0) // buyer bears it — no farmer deduction
    expect(buyerInvoices[0]!.bagCharge).toBe(500) // buyer picks up the bardana cost instead
    // loan debit (-500) + resolution credit (+500) cancel exactly — bardana debt nets to zero
    expect(balanceOf([loanEntry, resolution], 'farmer-ali')).toBe(0)
    expect(balanceOf(stream, 'farmer-ali')).toBe(farmerBill.net) // only the ordinary sale net remains
  })
})
