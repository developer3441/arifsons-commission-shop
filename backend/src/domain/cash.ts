// The Rokar-only cash actions that close balances (issue #5). Golden rule
// (blueprint Khata 1 / §6): Rokar is touched only when physical cash actually
// moves — never for accrual-only actions like a trade entry.
//
// Each action posts through the same primitive: a signed Rokar posting plus a
// matching signed posting to the other account, so both ledgers move by
// exactly the cash amount that changed hands.

import { type Account, type Entry, type Posting, ROKAR_ID } from './posting'
import { type PKR, pkr, negatePkr } from './money'

function cashEntry(id: string, kind: Entry['kind'], otherAccountId: string, rokarDelta: PKR): Entry {
  const postings: Posting[] = [
    { accountId: ROKAR_ID, amount: rokarDelta },
    { accountId: otherAccountId, amount: rokarDelta },
  ]
  return { id, kind, postings }
}

/**
 * A buyer clears their Pakka tab in full: Rokar +N, buyer balance -> 0.
 * `currentBalance` is the buyer's balance before payment (negative = owed).
 */
export function buyerPayment(id: string, buyer: Account, currentBalance: PKR): Entry {
  if (buyer.kind !== 'pakka') {
    throw new Error('A buyer payment must go to a Pakka (buyer) account')
  }
  if (currentBalance >= 0) {
    throw new RangeError('Buyer has no outstanding receivable to pay')
  }
  const amount = pkr(-currentBalance)
  return cashEntry(id, 'buyer_payment', buyer.id, amount)
}

/**
 * A farmer withdraws all or part of their held (positive) balance: Rokar -N,
 * farmer balance down by N. `currentBalance` is the farmer's balance before
 * withdrawal (positive = held credit available to withdraw).
 */
export function farmerWithdrawal(
  id: string,
  farmer: Account,
  amount: PKR,
  currentBalance: PKR,
): Entry {
  if (farmer.kind !== 'zamindar') {
    throw new Error('A withdrawal must come from a Zamindar (farmer) account')
  }
  if (amount <= 0) {
    throw new RangeError('Withdrawal amount must be positive')
  }
  if (amount > currentBalance) {
    throw new RangeError('Withdrawal cannot exceed the farmer\'s held balance')
  }
  return cashEntry(id, 'farmer_withdrawal', farmer.id, negatePkr(amount))
}

/**
 * A contractor collects wages in full: Rokar -N, thekedar balance -> 0.
 * `currentBalance` is the contractor's balance before payout (positive = owed wages).
 */
export function contractorPayout(id: string, thekedar: Account, currentBalance: PKR): Entry {
  if (thekedar.kind !== 'thekedar') {
    throw new Error('A payout must go to a Thekedar (contractor) account')
  }
  if (currentBalance <= 0) {
    throw new RangeError('Contractor has no outstanding wages to collect')
  }
  return cashEntry(id, 'contractor_payout', thekedar.id, negatePkr(currentBalance))
}

/**
 * Remit held cess to the market committee in full: Rokar -N, government ledger
 * -> 0 (ADR-0004). `currentBalance` is the government ledger's balance before
 * remittance (positive = cess held on the market committee's behalf).
 */
export function remitCess(id: string, government: Account, currentBalance: PKR): Entry {
  if (government.kind !== 'government') {
    throw new Error('A remittance must come from the government (Cess) ledger')
  }
  if (currentBalance <= 0) {
    throw new RangeError('No cess is held to remit')
  }
  return cashEntry(id, 'cess_remittance', government.id, negatePkr(currentBalance))
}
