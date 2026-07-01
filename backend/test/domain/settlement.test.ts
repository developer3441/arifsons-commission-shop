import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { settleFarmerProceeds } from '../../src/domain/settlement'
import {
  ROKAR_ID,
  rokarAccount,
  zamindarAccount,
  issuePeshiAdvance,
  balanceOf,
  type Entry,
} from '../../src/domain/posting'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'

// Issue #4 — settlement cascade: a farmer's outstanding Peshi/bag debt is repaid
// from new crop proceeds first; only the remainder becomes a held credit
// balance. Governing: blueprint §6 automated reconciliation flow, ADR-0008.

describe('settleFarmerProceeds — the auto-deduction cascade', () => {
  it('full repay: proceeds clear the whole debt and leave a held surplus', () => {
    const result = settleFarmerProceeds(pkr(-50_000), pkr(194_000))
    expect(result).toEqual({
      debtRepaid: 50_000,
      heldSurplus: 144_000,
      remainingDebt: 0,
      newBalance: 144_000,
    })
  })

  it('partial repay: proceeds do not clear the debt; balance stays negative by the shortfall', () => {
    const result = settleFarmerProceeds(pkr(-50_000), pkr(30_000))
    expect(result).toEqual({
      debtRepaid: 30_000,
      heldSurplus: 0,
      remainingDebt: 20_000,
      newBalance: -20_000,
    })
  })

  it('exact-zero: proceeds exactly clear the debt, nothing held, nothing owed', () => {
    const result = settleFarmerProceeds(pkr(-50_000), pkr(50_000))
    expect(result).toEqual({
      debtRepaid: 50_000,
      heldSurplus: 0,
      remainingDebt: 0,
      newBalance: 0,
    })
  })

  it('no existing debt: the whole proceeds amount is held', () => {
    const result = settleFarmerProceeds(pkr(0), pkr(75_000))
    expect(result).toEqual({
      debtRepaid: 0,
      heldSurplus: 75_000,
      remainingDebt: 0,
      newBalance: 75_000,
    })
  })
})

describe('the cascade end-to-end through the posting stream', () => {
  it('an advance debt is auto-repaid from a later sale, holding the surplus', () => {
    const rokar = rokarAccount()
    const farmer = zamindarAccount('farmer-ali')

    const entry: TradeEntry = {
      id: 'trade-1',
      farmerId: 'farmer-ali',
      thekedarId: 'thekedar-1',
      lotBags: 40,
      lines: [{ buyerId: 'buyer-mill', bags: Array.from({ length: 40 }, () => ({ grossKg: 101.5 })), ratePerMaund: 2000 }],
    }
    const config: TradeConfig = {
      farmerCommissionRate: 0.02,
      buyerCommissionRate: 0,
      perBagLabour: 50,
      perBagCharge: 0,
      bagBearer: 'farmer',
      labourBearer: 'farmer',
      kattKgPerBag: 1.5,
      cessRate: 0,
    }
    const { postings } = postTradeEntry(entry, config) // net to farmer: +194,000

    const stream: Entry[] = [
      issuePeshiAdvance('advance-1', farmer, pkr(50_000)),
      { id: 'trade-1', kind: 'trade', postings },
    ]

    const farmerBalance = balanceOf(stream, 'farmer-ali')
    expect(farmerBalance).toBe(144_000) // 194,000 net − 50,000 debt, cascade applied

    const cascade = settleFarmerProceeds(pkr(-50_000), pkr(194_000))
    expect(cascade.newBalance).toBe(farmerBalance)
  })
})
