import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { ROKAR_ID, balanceOf } from '../../src/domain/posting'
import { postGenesis } from '../../src/domain/genesis'
import { trueShopValue } from '../../src/domain/dashboard'
import { emptyGodown } from '../../src/domain/godown'

// Issue #19 — Genesis: one-time opening-balance import (ADR-0022). A single
// dated entry seeds Rokar cash + pre-existing farmer/buyer/contractor
// balances, flowing through the normal posting path so projections and
// reconciliation start from the shop's real position.

describe('postGenesis (issue #19)', () => {
  it('posts opening Rokar cash as a single positive posting', () => {
    const entry = postGenesis('genesis', {
      rokarOpening: pkr(500_000),
      farmerBalances: [],
      buyerBalances: [],
      contractorBalances: [],
    })
    expect(entry.kind).toBe('opening_balance')
    expect(balanceOf([entry], ROKAR_ID)).toBe(500_000)
  })

  it('posts pre-existing farmer, buyer, and contractor balances with the correct sign', () => {
    const entry = postGenesis('genesis', {
      rokarOpening: pkr(0),
      // farmer-owes-shop (outstanding Peshi debt) is negative; farmer-owed-by-shop is positive
      farmerBalances: [
        { farmerId: 'farmer-debt', balance: pkr(-20_000) },
        { farmerId: 'farmer-credit', balance: pkr(15_000) },
      ],
      buyerBalances: [{ buyerId: 'buyer-owes', balance: pkr(-40_000) }],
      contractorBalances: [{ thekedarId: 'thekedar-owed', balance: pkr(3_000) }],
    })
    expect(balanceOf([entry], 'farmer-debt')).toBe(-20_000)
    expect(balanceOf([entry], 'farmer-credit')).toBe(15_000)
    expect(balanceOf([entry], 'buyer-owes')).toBe(-40_000)
    expect(balanceOf([entry], 'thekedar-owed')).toBe(3_000)
  })

  it('omits zero-balance accounts from the postings', () => {
    const entry = postGenesis('genesis', {
      rokarOpening: pkr(100_000),
      farmerBalances: [{ farmerId: 'farmer-zero', balance: pkr(0) }],
      buyerBalances: [],
      contractorBalances: [],
    })
    expect(entry.postings).toHaveLength(1) // only Rokar — the zero-balance farmer is skipped
    expect(entry.postings.some((p) => p.accountId === 'farmer-zero')).toBe(false)
  })

  it('throws if there is nothing to import', () => {
    expect(() =>
      postGenesis('genesis', { rokarOpening: pkr(0), farmerBalances: [], buyerBalances: [], contractorBalances: [] }),
    ).toThrow()
  })

  it('the genesis entry alone reconciles to exactly its own opening equity', () => {
    const entry = postGenesis('genesis', {
      rokarOpening: pkr(1_000_000),
      farmerBalances: [{ farmerId: 'farmer-debt', balance: pkr(-50_000) }], // an outstanding advance
      buyerBalances: [{ buyerId: 'buyer-owes', balance: pkr(-30_000) }], // an outstanding receivable
      contractorBalances: [{ thekedarId: 'thekedar-owed', balance: pkr(10_000) }], // wages owed
    })
    const tsv = trueShopValue({
      stream: [entry],
      buyerAccountIds: ['buyer-owes'],
      farmerAccountIds: ['farmer-debt'],
      thekedarAccountIds: ['thekedar-owed'],
      godown: emptyGodown(),
      bardanaLoans: [],
    })
    // opening equity = cash + farmer receivable + buyer receivable − labour owed
    // = 1,000,000 + 50,000 + 30,000 − 10,000 = 1,070,000
    expect(tsv.total).toBe(1_070_000)
  })
})
