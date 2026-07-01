import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { pakkaAccount, zamindarAccount, thekedarAccount, ROKAR_ID } from '../../src/domain/posting'
import { buyerPayment, farmerWithdrawal, contractorPayout } from '../../src/domain/cash'

// Issue #5 — the Rokar-only cash actions that close balances. Golden rule
// (blueprint Khata 1): Rokar is touched only when cash actually moves.

describe('buyerPayment', () => {
  it('raises Rokar and zeroes the buyer balance', () => {
    const buyer = pakkaAccount('buyer-mill')
    const entry = buyerPayment('e1', buyer, pkr(-200_000))
    expect(entry.postings).toEqual([
      { accountId: ROKAR_ID, amount: 200_000 },
      { accountId: 'buyer-mill', amount: 200_000 },
    ])
  })

  it('rejects a buyer with no outstanding balance (nothing to pay)', () => {
    const buyer = pakkaAccount('buyer-mill')
    expect(() => buyerPayment('e1', buyer, pkr(0))).toThrow()
  })

  it('only a Pakka account can make a buyer payment', () => {
    const notABuyer = zamindarAccount('farmer-ali')
    expect(() => buyerPayment('e1', notABuyer as any, pkr(-1000))).toThrow()
  })
})

describe('farmerWithdrawal', () => {
  it('lowers Rokar and reduces the farmer balance by the withdrawal amount (partial)', () => {
    const farmer = zamindarAccount('farmer-ali')
    const entry = farmerWithdrawal('e1', farmer, pkr(50_000), pkr(144_000))
    expect(entry.postings).toEqual([
      { accountId: ROKAR_ID, amount: -50_000 },
      { accountId: 'farmer-ali', amount: -50_000 },
    ])
  })

  it('allows a full withdrawal of the entire held balance', () => {
    const farmer = zamindarAccount('farmer-ali')
    const entry = farmerWithdrawal('e1', farmer, pkr(144_000), pkr(144_000))
    expect(entry.postings).toEqual([
      { accountId: ROKAR_ID, amount: -144_000 },
      { accountId: 'farmer-ali', amount: -144_000 },
    ])
  })

  it('rejects a withdrawal larger than the held balance', () => {
    const farmer = zamindarAccount('farmer-ali')
    expect(() => farmerWithdrawal('e1', farmer, pkr(200_000), pkr(144_000))).toThrow()
  })

  it('rejects a non-positive withdrawal', () => {
    const farmer = zamindarAccount('farmer-ali')
    expect(() => farmerWithdrawal('e1', farmer, pkr(0), pkr(144_000))).toThrow()
  })
})

describe('contractorPayout', () => {
  it('lowers Rokar and zeroes the contractor balance', () => {
    const thekedar = thekedarAccount('thekedar-1')
    const entry = contractorPayout('e1', thekedar, pkr(2_000))
    expect(entry.postings).toEqual([
      { accountId: ROKAR_ID, amount: -2_000 },
      { accountId: 'thekedar-1', amount: -2_000 },
    ])
  })

  it('rejects a contractor with no outstanding wages', () => {
    const thekedar = thekedarAccount('thekedar-1')
    expect(() => contractorPayout('e1', thekedar, pkr(0))).toThrow()
  })
})

describe('golden rule (blueprint Khata 1): Rokar is touched only when cash moves', () => {
  it('every cash-settlement entry includes a Rokar posting', () => {
    const buyer = pakkaAccount('buyer-mill')
    const farmer = zamindarAccount('farmer-ali')
    const thekedar = thekedarAccount('thekedar-1')
    const entries = [
      buyerPayment('e1', buyer, pkr(-1000)),
      farmerWithdrawal('e2', farmer, pkr(500), pkr(500)),
      contractorPayout('e3', thekedar, pkr(200)),
    ]
    for (const entry of entries) {
      expect(entry.postings.some((p) => p.accountId === ROKAR_ID)).toBe(true)
    }
  })
})
