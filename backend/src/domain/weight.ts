// The canonical weight pipeline: gross kg per bag -> payable maunds. (ADR-0002)
// Bag count and weight are independent dimensions; Katt is a fixed kg-per-bag
// deduction, never a % of gross (ADR-0003). Payable weight is expressed in
// maunds (1 maund = 40 kg, a fixed constant).

/** Fixed conversion constant: 1 maund = 40 kg (ADR-0002). */
export const KG_PER_MAUND = 40

/** One weighed bag: its gross kg as weighed (taulai). */
export interface Bag {
  readonly grossKg: number
}

/**
 * payable_kg = max(0, gross - katt_per_bag) — a bag lighter than the katt
 * deduction clamps at zero rather than going negative (ADR-0003).
 */
export function payableKg(bag: Bag, kattKgPerBag: number): number {
  return Math.max(0, bag.grossKg - kattKgPerBag)
}

/**
 * Payable maunds = sum(payable_kg) / 40 across every bag in the lot (ADR-0002).
 * Not rounded here — rounding happens once at the money line total (ADR-0009).
 */
export function payableMaunds(bags: readonly Bag[], kattKgPerBag: number): number {
  const totalPayableKg = bags.reduce((sum, bag) => sum + payableKg(bag, kattKgPerBag), 0)
  return totalPayableKg / KG_PER_MAUND
}
