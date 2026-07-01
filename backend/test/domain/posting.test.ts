import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import {
  ROKAR_ID,
  rokarAccount,
  zamindarAccount,
  openingBalance,
  issuePeshiAdvance,
  balanceOf,
  type Entry,
} from '../../src/domain/posting'

// Issue #1 — walking skeleton: a Peshi advance through the pure posting engine.
// Governing decisions: ADR-0008 (interest-free), ADR-0010 (ledgers as
// projections), ADR-0009 (whole PKR rupees).

describe('Peshi advance walking skeleton (issue #1)', () => {
  it('creates a farmer (Zamindar) account', () => {
    const farmer = zamindarAccount('farmer-ali', 'Ali')
    expect(farmer).toEqual({ id: 'farmer-ali', kind: 'zamindar', name: 'Ali' })
  })

  it('issuing an advance posts farmer -N and Rokar -N in one entry', () => {
    const farmer = zamindarAccount('farmer-ali')
    const entry = issuePeshiAdvance('e1', farmer, pkr(200_000))

    expect(entry.kind).toBe('peshi_advance')
    expect(entry.postings).toEqual([
      { accountId: 'farmer-ali', amount: -200_000 },
      { accountId: ROKAR_ID, amount: -200_000 },
    ])
  })

  it('derives both balances from the posting stream', () => {
    const rokar = rokarAccount()
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [
      openingBalance('e0', rokar, pkr(1_000_000)),
      issuePeshiAdvance('e1', farmer, pkr(200_000)),
    ]

    expect(balanceOf(stream, ROKAR_ID)).toBe(800_000) // 1,000,000 cash − 200,000 out
    expect(balanceOf(stream, 'farmer-ali')).toBe(-200_000) // farmer owes the shop
  })

  it('rejects non-whole-rupee money (ADR-0009)', () => {
    expect(() => pkr(199_999.5)).toThrow(/whole PKR/)
  })

  it('rejects a non-positive advance', () => {
    const farmer = zamindarAccount('farmer-ali')
    expect(() => issuePeshiAdvance('e1', farmer, pkr(0))).toThrow()
  })

  it('only a Zamindar account can receive a Peshi advance', () => {
    const notAFarmer = rokarAccount()
    expect(() => issuePeshiAdvance('e1', notAFarmer, pkr(1000))).toThrow()
  })
})
