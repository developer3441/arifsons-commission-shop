// Bardana (empty bag) lending: pre-season, a farmer borrows empty bags from
// the shop. Tracked as a farmer receivable / asset-in-the-field (ADR-0010) —
// the "5 missing bags" gap that ADR-0010 exists to close — not a write-off.
// Bardana is not one of the 7 posting-stream ledgers (ADR-0004); its value is
// tracked alongside the stream and added into True Shop Value directly.

import { type PKR, pkr, roundToPkr, negatePkr } from './money'
import { type Account, type Entry, type Posting } from './posting'

/** A farmer's outstanding bardana (bags) lent out, valued at the empty-bag rate. */
export interface BardanaLoan {
  readonly farmerId: string
  readonly bagsOut: number
  readonly bagValue: PKR // whole PKR per empty bag
}

/** The PKR value of one bardana loan — its contribution to True Shop Value as an asset. */
export function bardanaLoanValue(loan: BardanaLoan): PKR {
  return roundToPkr(loan.bagsOut * loan.bagValue)
}

/** Sum the value of several outstanding bardana loans — True Shop Value's asset term (ADR-0010). */
export function totalBardanaOutValue(loans: readonly BardanaLoan[]): PKR {
  return loans.reduce((sum, loan) => pkr(sum + bardanaLoanValue(loan)), pkr(0))
}

/**
 * Lend N empty bags to a farmer pre-season: debits the farmer ledger (they
 * now owe the bag value) and returns the loan record for asset tracking. No
 * cash moves, so Rokar is untouched (golden rule, issue #5).
 */
export function lendBardana(
  id: string,
  farmer: Account,
  bagsOut: number,
  bagValue: PKR,
): { entry: Entry; loan: BardanaLoan } {
  if (farmer.kind !== 'zamindar') {
    throw new Error('Bardana can only be lent to a Zamindar (farmer) account')
  }
  if (bagsOut <= 0) {
    throw new RangeError('Must lend a positive number of bags')
  }
  const loan: BardanaLoan = { farmerId: farmer.id, bagsOut, bagValue }
  const value = bardanaLoanValue(loan)
  const postings: Posting[] = [{ accountId: farmer.id, amount: negatePkr(value) }]
  return { entry: { id, kind: 'bardana_loan', postings }, loan }
}

/**
 * Resolve an outstanding bardana loan when the farmer's crop is later sold:
 * credit back (reverse) the original lending debit. Pair this with the sale's
 * own bagBearer/perBagCharge (issue #6, ADR-0001) to re-apply the cost to
 * whichever side bears it — farmer-borne nets out to the same total debt the
 * farmer always owed; buyer-borne nets the farmer's bardana debt fully to
 * zero and the buyer/shop absorbs it instead.
 */
export function resolveBardanaLoan(id: string, loan: BardanaLoan): Entry {
  const value = bardanaLoanValue(loan)
  return { id, kind: 'bardana_resolution', postings: [{ accountId: loan.farmerId, amount: value }] }
}
