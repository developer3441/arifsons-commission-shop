// Guard rails: reject physically-impossible operations (ADR-0019). The
// oversell (lot) and over-resale (Godown) guards already live inline in
// trade.ts/godown.ts; this is the one shared across every cash-out action —
// Peshi advance, farmer withdrawal, contractor payout, cess remittance —
// none of which may drive Rokar below zero. Rokar stays a truthful count of
// physical cash actually in the drawer.
//
// This check needs the current Rokar balance, which is state the pure domain
// layer doesn't hold — callers (the route layer, "the API boundary" per the
// ADR) read the balance and pass it in before writing any posting.

import { type PKR } from './money'

export class InsufficientCashError extends Error {
  readonly available: PKR
  readonly requested: PKR

  constructor(available: PKR, requested: PKR) {
    super(`Insufficient cash in Rokar: available ${available}, requested ${requested}`)
    this.name = 'InsufficientCashError'
    this.available = available
    this.requested = requested
  }
}

/** Throws InsufficientCashError if paying `amount` out of Rokar would drive it negative. */
export function assertSufficientCash(currentRokarBalance: PKR, amount: PKR): void {
  if (currentRokarBalance - amount < 0) {
    throw new InsufficientCashError(currentRokarBalance, amount)
  }
}
