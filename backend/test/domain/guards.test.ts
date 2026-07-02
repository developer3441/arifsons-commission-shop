import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { assertSufficientCash, InsufficientCashError } from '../../src/domain/guards'

// Issue #20 / ADR-0019 — guard rails: any cash-out that would drive Rokar
// below zero is rejected, not recorded. One reusable check for every cash-out
// action (Peshi advance, farmer withdrawal, contractor payout, cess
// remittance).

describe('assertSufficientCash (ADR-0019)', () => {
  it('allows a cash-out that leaves Rokar at exactly zero', () => {
    expect(() => assertSufficientCash(pkr(200_000), pkr(200_000))).not.toThrow()
  })

  it('allows a cash-out well within the available balance', () => {
    expect(() => assertSufficientCash(pkr(200_000), pkr(50_000))).not.toThrow()
  })

  it('rejects a cash-out that would drive Rokar negative', () => {
    expect(() => assertSufficientCash(pkr(100_000), pkr(200_001))).toThrow(InsufficientCashError)
  })

  it('the error carries the available and requested amounts', () => {
    try {
      assertSufficientCash(pkr(100_000), pkr(150_000))
      throw new Error('expected assertSufficientCash to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientCashError)
      const e = err as InsufficientCashError
      expect(e.available).toBe(100_000)
      expect(e.requested).toBe(150_000)
    }
  })
})
