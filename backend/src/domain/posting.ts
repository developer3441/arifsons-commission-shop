// The pure posting engine. No I/O, no platform APIs — just the domain (ADR-0013).
//
// All financial state is an immutable stream of Entries. The seven ledgers are
// *projections* of that stream and are never written directly (ADR-0010, ADR-0014).

import { type PKR, pkr, addPkr, negatePkr } from './money'

/**
 * The seven ledgers one trade fans across. Cess is a government *liability*,
 * never income — which is why there are 7, not 6. (ADR-0004)
 */
export type LedgerKind =
  | 'rokar' // cash in hand
  | 'zamindar' // farmer (many accounts)
  | 'beopari' // house own-trading
  | 'thekedar' // labour contractor (many accounts)
  | 'pakka' // buyer / mill receivable
  | 'revenue' // commission income
  | 'government' // cess held for the government (liability)

/** Rokar is a singleton cash ledger — one account, one fixed id. */
export const ROKAR_ID = 'rokar'

/** Amdani (commission income) is a singleton revenue ledger — one fixed id. */
export const REVENUE_ID = 'revenue'

/** The government/cess pool is a singleton liability ledger — one fixed id. (ADR-0004) */
export const GOVERNMENT_ID = 'government'

export interface Account {
  readonly id: string
  readonly kind: LedgerKind
  readonly name?: string
}

/** One line of an entry: a signed amount hitting one account. */
export interface Posting {
  readonly accountId: string
  readonly amount: PKR
}

export type EntryKind =
  | 'opening_balance'
  | 'peshi_advance'
  | 'trade'
  | 'buyer_payment'
  | 'farmer_withdrawal'
  | 'contractor_payout'
  | 'cess_remittance'

/**
 * One immutable event in the posting stream. Ledgers project from these;
 * nothing mutates an Entry after it is recorded. (ADR-0010)
 */
export interface Entry {
  readonly id: string
  readonly kind: EntryKind
  readonly postings: readonly Posting[]
}

// --- accounts (the register) ---

/** The singleton Rokar cash account. */
export function rokarAccount(): Account {
  return { id: ROKAR_ID, kind: 'rokar' }
}

/** A farmer (Zamindar) account. */
export function zamindarAccount(id: string, name?: string): Account {
  return { id, kind: 'zamindar', name }
}

/** A buyer / mill (Pakka) account. */
export function pakkaAccount(id: string, name?: string): Account {
  return { id, kind: 'pakka', name }
}

/** A labour contractor (Thekedar) account. */
export function thekedarAccount(id: string, name?: string): Account {
  return { id, kind: 'thekedar', name }
}

/** The singleton government/cess liability account (ADR-0004). */
export function governmentAccount(): Account {
  return { id: GOVERNMENT_ID, kind: 'government' }
}

// --- entry primitives (the write side) ---

/** Seed an account's opening balance as a single positive posting. */
export function openingBalance(id: string, account: Account, amount: PKR): Entry {
  if (amount < 0) throw new RangeError('Opening balance cannot be negative')
  return { id, kind: 'opening_balance', postings: [{ accountId: account.id, amount }] }
}

/**
 * Issue an interest-free Peshi advance to a farmer (ADR-0008): cash leaves Rokar
 * and the farmer's ledger goes negative by the same amount. Both sides are
 * negative — this is the True Shop Value sign model, not zero-sum double-entry:
 * the negative farmer balance is money owed *to* the shop, i.e. an asset (ADR-0010).
 */
export function issuePeshiAdvance(id: string, farmer: Account, amount: PKR): Entry {
  if (farmer.kind !== 'zamindar') {
    throw new Error('A Peshi advance must go to a Zamindar (farmer) account')
  }
  if (amount <= 0) throw new RangeError('Advance amount must be positive')
  const out = negatePkr(amount)
  return {
    id,
    kind: 'peshi_advance',
    postings: [
      { accountId: farmer.id, amount: out },
      { accountId: ROKAR_ID, amount: out },
    ],
  }
}

// --- projection (the read side) ---

/**
 * A ledger balance is the sum of every posting to that account across the whole
 * immutable stream. This is the only way balances are read — never stored.
 */
export function balanceOf(stream: readonly Entry[], accountId: string): PKR {
  let total = pkr(0)
  for (const entry of stream) {
    for (const posting of entry.postings) {
      if (posting.accountId === accountId) total = addPkr(total, posting.amount)
    }
  }
  return total
}
