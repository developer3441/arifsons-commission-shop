import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import {
  thekedarAccount,
  balanceOf,
  sumBalancesOf,
  type Entry,
} from '../../src/domain/posting'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import { contractorPayout } from '../../src/domain/cash'

// Issue #8 — multiple Thekedars: each lot's labour routes to a chosen
// contractor; each contractor accumulates independently and pays out on its
// own. Governing: ADR-0007.

const config: TradeConfig = {
  farmerCommissionRate: 0,
  buyerCommissionRate: 0,
  perBagLabour: 50,
  perBagCharge: 0,
  bagBearer: 'farmer',
  labourBearer: 'farmer',
  kattKgPerBag: 0,
  cessRate: 0,
}

function tradeFor(thekedarId: string, farmerId: string, bagCount: number): TradeEntry {
  return {
    id: `t-${thekedarId}-${farmerId}`,
    farmerId,
    thekedarId,
    lotBags: bagCount,
    lines: [{
      buyerId: 'buyer-mill',
      bags: Array.from({ length: bagCount }, () => ({ grossKg: 40 })),
      ratePerMaund: 1000,
    }],
  }
}

describe('routing labour to a chosen contractor (issue #8)', () => {
  it('two different trades route to two different contractors independently', () => {
    const tradeA = postTradeEntry(tradeFor('thekedar-a', 'farmer-1', 40), config) // 40 x 50 = 2,000
    const tradeB = postTradeEntry(tradeFor('thekedar-b', 'farmer-2', 20), config) // 20 x 50 = 1,000

    const stream: Entry[] = [
      { id: 'e1', kind: 'trade', postings: tradeA.postings },
      { id: 'e2', kind: 'trade', postings: tradeB.postings },
    ]

    expect(balanceOf(stream, 'thekedar-a')).toBe(2_000)
    expect(balanceOf(stream, 'thekedar-b')).toBe(1_000)
  })

  it('a second lot to the same contractor accumulates on top of the first', () => {
    const trade1 = postTradeEntry(tradeFor('thekedar-a', 'farmer-1', 40), config) // 2,000
    const trade2 = postTradeEntry(tradeFor('thekedar-a', 'farmer-3', 10), config) // 500

    const stream: Entry[] = [
      { id: 'e1', kind: 'trade', postings: trade1.postings },
      { id: 'e2', kind: 'trade', postings: trade2.postings },
    ]

    expect(balanceOf(stream, 'thekedar-a')).toBe(2_500)
  })

  it('each contractor pays out independently, zeroing only its own balance', () => {
    const tradeA = postTradeEntry(tradeFor('thekedar-a', 'farmer-1', 40), config)
    const tradeB = postTradeEntry(tradeFor('thekedar-b', 'farmer-2', 20), config)

    const stream: Entry[] = [
      { id: 'e1', kind: 'trade', postings: tradeA.postings },
      { id: 'e2', kind: 'trade', postings: tradeB.postings },
    ]

    const payoutA = contractorPayout('payout-a', thekedarAccount('thekedar-a'), balanceOf(stream, 'thekedar-a'))
    const afterPayout: Entry[] = [...stream, payoutA]

    expect(balanceOf(afterPayout, 'thekedar-a')).toBe(0) // paid out
    expect(balanceOf(afterPayout, 'thekedar-b')).toBe(1_000) // untouched
  })

  it('outstanding-labour liability sums all contractor balances (ADR-0007)', () => {
    const tradeA = postTradeEntry(tradeFor('thekedar-a', 'farmer-1', 40), config) // 2,000
    const tradeB = postTradeEntry(tradeFor('thekedar-b', 'farmer-2', 20), config) // 1,000
    const tradeC = postTradeEntry(tradeFor('thekedar-c', 'farmer-3', 4), config) // 200

    const stream: Entry[] = [
      { id: 'e1', kind: 'trade', postings: tradeA.postings },
      { id: 'e2', kind: 'trade', postings: tradeB.postings },
      { id: 'e3', kind: 'trade', postings: tradeC.postings },
    ]

    expect(sumBalancesOf(stream, ['thekedar-a', 'thekedar-b', 'thekedar-c'])).toBe(3_200)

    // after one contractor is paid out, the aggregate liability drops by exactly their share
    const payoutB = contractorPayout('payout-b', thekedarAccount('thekedar-b'), pkr(1_000))
    const afterPayout = [...stream, payoutB]
    expect(sumBalancesOf(afterPayout, ['thekedar-a', 'thekedar-b', 'thekedar-c'])).toBe(2_200)
  })
})
