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
import { type Entry } from './posting'
import { entriesForAccount } from './dashboard'

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

/** One line of a farmer's running statement (issue #26). */
export interface StatementLine {
  entryId: string
  kind: Entry['kind']
  /** Signed amount this entry posted to the farmer's account. */
  amount: PKR
  /** The farmer's running balance immediately after this entry. */
  balanceAfter: PKR
  /** Present only for a 'trade' entry that credited the farmer (proceeds) —
   * how that sale's payout was applied (ADR-0008). */
  settlement?: SettlementResult
}

/**
 * A farmer's full running statement (issue #26, ADR-0008/0010): every entry
 * that touched their account, in stream order, with the running balance after
 * each one. A projection only — never stored, always derived fresh from the
 * posting stream (architecture.md).
 */
export function farmerStatement(stream: readonly Entry[], farmerId: string): StatementLine[] {
  const touching = entriesForAccount(stream, farmerId)
  let balance = pkr(0)
  const lines: StatementLine[] = []
  for (const entry of touching) {
    const amount = entry.postings
      .filter((p) => p.accountId === farmerId)
      .reduce((sum, p) => pkr(sum + p.amount), pkr(0))
    const balanceBefore = balance
    balance = pkr(balance + amount)
    const settlement = entry.kind === 'trade' && amount > 0 ? settleFarmerProceeds(balanceBefore, amount) : undefined
    lines.push({ entryId: entry.id, kind: entry.kind, amount, balanceAfter: balance, ...(settlement ? { settlement } : {}) })
  }
  return lines
}
