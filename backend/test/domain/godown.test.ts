import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import {
  HOUSE_BUYER_ID,
  houseBuyerAccount,
  houseBuyCost,
  receiveStock,
  averageCostPerKg,
  resellStock,
  emptyGodown,
  type GodownState,
} from '../../src/domain/godown'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'

// Issue #11 — Beopari: house buyer purchase into Godown stock at cost.
// Governing: ADR-0005 (shop as internal buyer, Godown at avg cost).

const config: TradeConfig = {
  farmerCommissionRate: 0.02,
  buyerCommissionRate: 0,
  perBagLabour: 50,
  perBagCharge: 0,
  bagBearer: 'farmer',
  labourBearer: 'farmer',
  kattKgPerBag: 0,
  cessRate: 0,
}

describe('a sale line can target the internal house buyer (issue #11)', () => {
  it('reuses the normal auction flow — the house buyer account works like any other buyer', () => {
    const entry: TradeEntry = {
      id: 'trade-house-1',
      farmerId: 'farmer-ali',
      thekedarId: 'thekedar-1',
      lotBags: 40,
      lines: [{ buyerId: HOUSE_BUYER_ID, bags: Array.from({ length: 40 }, () => ({ grossKg: 40 })), ratePerMaund: 2000 }],
    }
    const { postings, buyerInvoices, farmerBill } = postTradeEntry(entry, config)
    // 40 maund x 2000 = 80,000 bid; 2% commission = 1,600; 40 bags x 50 labour = 2,000
    expect(buyerInvoices[0]!.buyerId).toBe(HOUSE_BUYER_ID)
    expect(buyerInvoices[0]!.total).toBe(80_000)
    expect(farmerBill.net).toBe(80_000 - 1_600 - 2_000)
    expect(postings.find((p) => p.accountId === HOUSE_BUYER_ID)?.amount).toBe(-80_000)
    expect(houseBuyerAccount()).toEqual({ id: HOUSE_BUYER_ID, kind: 'beopari' })
  })
})

describe('stock enters the Godown at cost = bid + haul-in labour (issue #11)', () => {
  it('house-buy cost is the winning bid plus haul-in labour', () => {
    expect(houseBuyCost(pkr(80_000), pkr(2_000))).toBe(82_000)
  })

  it('receiving stock tracks bags, net kg, and running average cost per kg', () => {
    const state1 = receiveStock(emptyGodown(), { bags: 40, netKg: 1_600, costBasis: pkr(82_000) })
    expect(state1).toEqual({ bags: 40, netKg: 1_600, totalCostBasis: 82_000 })
    expect(averageCostPerKg(state1)).toBe(82_000 / 1_600)

    // a second house purchase at a different rate blends into the running average
    const state2 = receiveStock(state1, { bags: 20, netKg: 800, costBasis: pkr(50_000) })
    expect(state2).toEqual({ bags: 60, netKg: 2_400, totalCostBasis: 132_000 })
    expect(averageCostPerKg(state2)).toBe(132_000 / 2_400)
  })
})

describe('a later resale realises trading P&L, separate from commission (issue #11)', () => {
  it('sells stock at the running average cost and books the profit', () => {
    const state: GodownState = { bags: 40, netKg: 1_600, totalCostBasis: pkr(80_000) } // avg 50/kg
    const { newState, costOfGoodsSold, tradingPnL } = resellStock(state, 40, 1_600, pkr(100_000))

    expect(costOfGoodsSold).toBe(80_000) // 1,600kg x 50/kg
    expect(tradingPnL).toBe(20_000) // 100,000 sale − 80,000 cost
    expect(newState).toEqual({ bags: 0, netKg: 0, totalCostBasis: 0 })
  })

  it('a partial resale draws down the Godown proportionally and keeps the same average', () => {
    const state: GodownState = { bags: 40, netKg: 1_600, totalCostBasis: pkr(80_000) } // avg 50/kg
    const { newState, costOfGoodsSold } = resellStock(state, 20, 800, pkr(45_000))

    expect(costOfGoodsSold).toBe(40_000) // 800kg x 50/kg
    expect(newState).toEqual({ bags: 20, netKg: 800, totalCostBasis: 40_000 })
    expect(averageCostPerKg(newState)).toBe(50) // average unchanged after a proportional draw-down
  })

  it('rejects reselling more stock than the Godown holds', () => {
    const state: GodownState = { bags: 10, netKg: 400, totalCostBasis: pkr(20_000) }
    expect(() => resellStock(state, 20, 400, pkr(10_000))).toThrow()
    expect(() => resellStock(state, 10, 800, pkr(10_000))).toThrow()
  })
})

describe('end-to-end: a house purchase lands in the Godown, then is resold (issue #11)', () => {
  it('purchase cost (bid + haul-in labour) becomes the Godown entry, later resale realises P&L', () => {
    const purchase: TradeEntry = {
      id: 'trade-house-2',
      farmerId: 'farmer-b',
      thekedarId: 'thekedar-1',
      lotBags: 40,
      lines: [{ buyerId: HOUSE_BUYER_ID, bags: Array.from({ length: 40 }, () => ({ grossKg: 40 })), ratePerMaund: 2000 }],
    }
    const { buyerInvoices, payableMaunds } = postTradeEntry(purchase, config)
    const bid = buyerInvoices[0]!.saleValue // 80,000 — the winning bid, excluding commission
    const haulInLabour = pkr(2_000) // 40 bags x 50/bag, paid to the contractor
    const cost = houseBuyCost(bid, haulInLabour)

    const godown = receiveStock(emptyGodown(), { bags: 40, netKg: payableMaunds * 40, costBasis: cost })
    expect(godown).toEqual({ bags: 40, netKg: 1_600, totalCostBasis: 82_000 })

    // later, the shop flips the whole lot to a real mill at 90,000
    const { tradingPnL, costOfGoodsSold } = resellStock(godown, 40, 1_600, pkr(90_000))
    expect(costOfGoodsSold).toBe(82_000)
    expect(tradingPnL).toBe(8_000) // realised trading profit, distinct from any commission
  })
})
