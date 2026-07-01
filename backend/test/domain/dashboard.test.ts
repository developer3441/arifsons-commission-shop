import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import {
  rokarAccount,
  zamindarAccount,
  pakkaAccount,
  thekedarAccount,
  governmentAccount,
  openingBalance,
  issuePeshiAdvance,
  type Entry,
} from '../../src/domain/posting'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { buyerPayment, contractorPayout } from '../../src/domain/cash'
import { lendBardana, resolveBardanaLoan, type BardanaLoan } from '../../src/domain/bardana'
import { HOUSE_BUYER_ID, emptyGodown, receiveStock, resellStock, houseBuyCost, postStockResale } from '../../src/domain/godown'
import { cashInHand, trueShopValue, retainedProfit, reconcile, entriesForAccount } from '../../src/domain/dashboard'

// Issue #12 — Dashboard + reconciliation oracle (capstone). Governing:
// ADR-0010 (full balance sheet, reconciliation invariant).

describe('Cash in Hand and True Shop Value are separate pillars (issue #12)', () => {
  it('cash alone differs from the full balance sheet once other ledgers move', () => {
    const rokar = rokarAccount()
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [
      openingBalance('open', rokar, pkr(1_000_000)),
      issuePeshiAdvance('adv-1', farmer, pkr(200_000)),
    ]
    expect(cashInHand(stream)).toBe(800_000) // cash actually dropped

    const tsv = trueShopValue({
      stream,
      buyerAccountIds: [],
      farmerAccountIds: ['farmer-ali'],
      thekedarAccountIds: [],
      godown: emptyGodown(),
      bardanaLoans: [],
    })
    // the advance is an asset (farmer receivable) exactly offsetting the cash drop
    expect(tsv.total).toBe(1_000_000)
    expect(tsv.farmerReceivables).toBe(200_000)
    expect(tsv.cash).toBe(800_000)
  })
})

describe('True Shop Value includes bardana-out (asset) and cess-held (liability) (issue #12)', () => {
  it('an outstanding bardana loan counts as an asset', () => {
    const loans: BardanaLoan[] = [{ farmerId: 'farmer-x', bagsOut: 5, bagValue: pkr(100) }]
    const tsv = trueShopValue({
      stream: [],
      buyerAccountIds: [],
      farmerAccountIds: [],
      thekedarAccountIds: [],
      godown: emptyGodown(),
      bardanaLoans: loans,
    })
    expect(tsv.bardanaOutValue).toBe(500)
    expect(tsv.total).toBe(500)
  })

  it('cess held (unremitted) counts as a liability', () => {
    const config: TradeConfig = {
      farmerCommissionRate: 0,
      buyerCommissionRate: 0,
      perBagLabour: 0,
      perBagCharge: 0,
      bagBearer: 'farmer',
      labourBearer: 'farmer',
      kattKgPerBag: 0,
      cessRate: 0.05,
    }
    const entry: TradeEntry = {
      id: 't1',
      farmerId: 'farmer-x',
      thekedarId: 'th-1',
      lotBags: 20,
      lines: [{ buyerId: 'buyer-x', bags: Array.from({ length: 20 }, () => ({ grossKg: 40 })), ratePerMaund: 1000 }],
    }
    const { postings } = postTradeEntry(entry, config) // 20,000 sale, 1,000 cess held
    const stream: Entry[] = [{ id: 't1', kind: 'trade', postings }]

    const tsv = trueShopValue({
      stream,
      buyerAccountIds: ['buyer-x'],
      farmerAccountIds: ['farmer-x'],
      thekedarAccountIds: ['th-1'],
      godown: emptyGodown(),
      bardanaLoans: [],
    })
    expect(tsv.cessHeld).toBe(1_000)
  })
})

describe('ledger drill-down: every entry touching an account, in order (issue #12)', () => {
  it('entriesForAccount finds only the entries that touch a given account', () => {
    const rokar = rokarAccount()
    const farmerA = zamindarAccount('farmer-a')
    const farmerB = zamindarAccount('farmer-b')
    const stream: Entry[] = [
      openingBalance('open', rokar, pkr(1_000_000)),
      issuePeshiAdvance('adv-a', farmerA, pkr(50_000)),
      issuePeshiAdvance('adv-b', farmerB, pkr(30_000)),
    ]
    const forFarmerA = entriesForAccount(stream, 'farmer-a')
    expect(forFarmerA.map((e) => e.id)).toEqual(['adv-a'])

    const forRokar = entriesForAccount(stream, 'rokar')
    expect(forRokar.map((e) => e.id)).toEqual(['open', 'adv-a', 'adv-b'])
  })
})

describe('reconciliation invariant across a multi-entry scenario (issue #12)', () => {
  it('True Shop Value equals seed capital + retained profit, no manual fudge, across every ledger type', () => {
    const seed = pkr(1_000_000)
    const stream: Entry[] = []

    // 1. Seed the shop.
    stream.push(openingBalance('open', rokarAccount(), seed))

    // 2. Pre-season advance to farmer-1 (left partially unrepaid on purpose,
    //    to prove the farmer-receivable correction reconciles correctly).
    stream.push(issuePeshiAdvance('adv-1', zamindarAccount('farmer-1'), pkr(100_000)))

    // 3. farmer-1 sells; the cascade repays part of the advance (issue #4),
    //    leaving a residual debt.
    const trade1Config: TradeConfig = {
      farmerCommissionRate: 0.02, buyerCommissionRate: 0, perBagLabour: 50, perBagCharge: 0,
      bagBearer: 'farmer', labourBearer: 'farmer', kattKgPerBag: 0, cessRate: 0,
    }
    const trade1: TradeEntry = {
      id: 'trade-1', farmerId: 'farmer-1', thekedarId: 'thekedar-1', lotBags: 40,
      lines: [{ buyerId: 'buyer-mill', bags: Array.from({ length: 40 }, () => ({ grossKg: 40 })), ratePerMaund: 2000 }],
    }
    const r1 = postTradeEntry(trade1, trade1Config) // 80,000 sale, 1,600 commission, 2,000 labour, net 76,400
    stream.push({ id: 'trade-1', kind: 'trade', postings: r1.postings })

    // 4. The buyer pays off their Pakka tab.
    stream.push(buyerPayment('pay-mill', pakkaAccount('buyer-mill'), pkr(-r1.buyerInvoices[0]!.total)))

    // 5. The contractor collects wages.
    stream.push(contractorPayout('payout-th1', thekedarAccount('thekedar-1'), pkr(2_000)))

    // 6. farmer-2 sells with cess (left unremitted).
    const trade2Config: TradeConfig = {
      farmerCommissionRate: 0, buyerCommissionRate: 0, perBagLabour: 0, perBagCharge: 0,
      bagBearer: 'farmer', labourBearer: 'farmer', kattKgPerBag: 0, cessRate: 0.05,
    }
    const trade2: TradeEntry = {
      id: 'trade-2', farmerId: 'farmer-2', thekedarId: 'thekedar-2', lotBags: 20,
      lines: [{ buyerId: 'buyer-2', bags: Array.from({ length: 20 }, () => ({ grossKg: 40 })), ratePerMaund: 1000 }],
    }
    const r2 = postTradeEntry(trade2, trade2Config)
    stream.push({ id: 'trade-2', kind: 'trade', postings: r2.postings })

    // 7. Bardana: lend farmer-3 bags, then resolve buyer-borne on their sale
    //    (nets the farmer's bardana debt fully to zero — issue #10).
    const bardanaLend = lendBardana('loan-3', zamindarAccount('farmer-3'), 5, pkr(100))
    stream.push(bardanaLend.entry)
    const trade3Config: TradeConfig = {
      farmerCommissionRate: 0, buyerCommissionRate: 0, perBagLabour: 0, perBagCharge: 100,
      bagBearer: 'buyer', labourBearer: 'farmer', kattKgPerBag: 0, cessRate: 0,
    }
    const trade3: TradeEntry = {
      id: 'trade-3', farmerId: 'farmer-3', thekedarId: 'thekedar-3', lotBags: 5,
      lines: [{ buyerId: 'buyer-3', bags: Array.from({ length: 5 }, () => ({ grossKg: 40 })), ratePerMaund: 800 }],
    }
    const r3 = postTradeEntry(trade3, trade3Config)
    stream.push(resolveBardanaLoan('resolve-3', bardanaLend.loan))
    stream.push({ id: 'trade-3', kind: 'trade', postings: r3.postings })

    // 8. Beopari: house purchase from farmer-4 into the Godown, later resold
    //    to a real buyer at a profit (issue #11).
    const houseConfig: TradeConfig = {
      farmerCommissionRate: 0.02, buyerCommissionRate: 0, perBagLabour: 50, perBagCharge: 0,
      bagBearer: 'farmer', labourBearer: 'farmer', kattKgPerBag: 0, cessRate: 0,
    }
    const houseTrade: TradeEntry = {
      id: 'trade-house', farmerId: 'farmer-4', thekedarId: 'thekedar-4', lotBags: 10,
      lines: [{ buyerId: HOUSE_BUYER_ID, bags: Array.from({ length: 10 }, () => ({ grossKg: 40 })), ratePerMaund: 1500 }],
    }
    const rHouse = postTradeEntry(houseTrade, houseConfig)
    stream.push({ id: 'trade-house', kind: 'trade', postings: rHouse.postings })
    const houseLabour = rHouse.postings.find((p) => p.accountId === 'thekedar-4')!.amount
    const godownAfterPurchase = receiveStock(emptyGodown(), {
      bags: 10,
      netKg: rHouse.payableMaunds * 40,
      costBasis: houseBuyCost(rHouse.farmerBill.net, pkr(houseLabour)),
    })
    const resale = resellStock(godownAfterPurchase, 10, godownAfterPurchase.netKg, pkr(16_000))
    stream.push(postStockResale('resale-1', 'buyer-5', pkr(16_000), resale))

    // -- reconcile --
    const result = reconcile(seed, {
      stream,
      buyerAccountIds: ['buyer-mill', 'buyer-2', 'buyer-3', 'buyer-5'], // real external buyers only — house excluded
      farmerAccountIds: ['farmer-1', 'farmer-2', 'farmer-3', 'farmer-4'],
      thekedarAccountIds: ['thekedar-1', 'thekedar-2', 'thekedar-3', 'thekedar-4'],
      godown: resale.newState,
      bardanaLoans: [], // farmer-3's loan was resolved — no longer outstanding
    })

    expect(result.drift).toBe(0)
    expect(result.reconciles).toBe(true)
    expect(result.trueShopValue).toBe(result.expected)

    // spot-checks on the pieces that make it up
    expect(cashInHand(stream)).toBe(978_000) // 1,000,000 − 100,000 + 80,000 − 2,000
    expect(retainedProfit(stream)).toBe(3_400) // 1,600 (trade1) + 500 (trade3 bag charge) + 1,300 (resale P&L)
  })
})
