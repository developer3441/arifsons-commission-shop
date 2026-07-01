import { describe, it, expect } from 'vitest'
import { payableKg, payableMaunds, KG_PER_MAUND, type Bag } from '../../src/domain/weight'

// Issue #3 — canonical weight pipeline: gross kg per bag -> payable maunds.
// Governing: ADR-0002 (gross kg per bag, bag != maund), ADR-0003 (Katt = fixed
// kg-per-bag deduction, clamp at zero on light bags).

describe('payableKg (ADR-0003)', () => {
  it('subtracts a fixed katt-per-bag from gross kg', () => {
    expect(payableKg({ grossKg: 41.5 }, 1.5)).toBe(40)
  })

  it('clamps at zero for a bag lighter than the katt deduction', () => {
    expect(payableKg({ grossKg: 1 }, 1.5)).toBe(0)
  })

  it('a bag heavier than 40kg still pays for everything above the deduction', () => {
    expect(payableKg({ grossKg: 100 }, 1.5)).toBe(98.5)
  })
})

describe('payableMaunds (ADR-0002)', () => {
  it('sums payable kg across variable-weight bags and divides by 40', () => {
    const bags: Bag[] = [{ grossKg: 41.5 }, { grossKg: 45 }, { grossKg: 38 }]
    // payable: 40, 43.5, 36.5 = 120 / 40 = 3
    expect(payableMaunds(bags, 1.5)).toBe(3)
  })

  it('a clamp-at-zero light bag contributes nothing to the total', () => {
    const bags: Bag[] = [{ grossKg: 41.5 }, { grossKg: 1 }]
    // payable: 40, 0 = 40 / 40 = 1
    expect(payableMaunds(bags, 1.5)).toBe(1)
  })

  it('KG_PER_MAUND is the fixed 40kg constant', () => {
    expect(KG_PER_MAUND).toBe(40)
  })
})
