// The auto-deduction settlement cascade (blueprint §6, ADR-0008): when a farmer
// with an outstanding Peshi/bag debt sells, new crop proceeds repay that debt
// first; only the remainder becomes a positive (held) farmer balance.
//
// This is a pure reporting/breakdown helper. It does not itself post anything —
// the farmer ledger already nets correctly because balanceOf (posting.ts) sums
// the whole stream regardless of order. This function exists so callers (Kacha
// bill / farmer statement) can show *how* a sale's proceeds were applied: how
// much cleared old debt, how much is newly held, and how much debt remains.

import { type PKR, pkr } from './money'

export interface SettlementResult {
  /** How much of the proceeds went to clearing existing debt. */
  debtRepaid: PKR
  /** Proceeds left over after the debt is cleared — the farmer's new held credit. */
  heldSurplus: PKR
  /** Debt still outstanding if proceeds did not fully cover it. */
  remainingDebt: PKR
  /** The farmer's resulting ledger balance (negative = still owes, positive = held). */
  newBalance: PKR
}

/**
 * currentBalance is the farmer's ledger balance *before* the sale (negative =
 * owes the shop, per ADR-0010's sign model; zero or positive = no debt).
 * proceeds is the sale's net payout (Kacha bill `net`), always >= 0.
 */
export function settleFarmerProceeds(currentBalance: PKR, proceeds: PKR): SettlementResult {
  const existingDebt = currentBalance < 0 ? pkr(-currentBalance) : pkr(0)
  const debtRepaid = pkr(Math.min(existingDebt, proceeds))
  const remainingDebt = pkr(existingDebt - debtRepaid)
  const heldSurplus = pkr(proceeds - debtRepaid)
  const newBalance = pkr(heldSurplus - remainingDebt)

  return { debtRepaid, heldSurplus, remainingDebt, newBalance }
}
