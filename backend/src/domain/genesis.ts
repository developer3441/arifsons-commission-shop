// Genesis: one-time opening-balance import (ADR-0022). Onboarding a shop that
// is not empty — it already has cash, standing farmer/buyer/contractor
// balances — needs a way for those pre-existing figures to enter the
// append-only posting stream (ADR-0021). This is an ordinary set of postings
// so it flows through the exact same projections and reconciliation math as
// everything else; no special-case balance logic is needed anywhere else.

import { type PKR } from './money'
import { type Entry, type Posting, ROKAR_ID } from './posting'

export interface GenesisFarmerBalance {
  farmerId: string
  /** Signed (ADR-0010): negative = outstanding Peshi debt (an asset), positive = held credit (a liability). */
  balance: PKR
}

export interface GenesisBuyerBalance {
  buyerId: string
  /** Signed: negative = the buyer owes on a won lot (a receivable/asset). */
  balance: PKR
}

export interface GenesisContractorBalance {
  thekedarId: string
  /** Signed: positive = wages owed to the contractor (a liability). */
  balance: PKR
}

export interface GenesisInput {
  rokarOpening: PKR
  farmerBalances: readonly GenesisFarmerBalance[]
  buyerBalances: readonly GenesisBuyerBalance[]
  contractorBalances: readonly GenesisContractorBalance[]
}

/**
 * Build the single dated genesis entry (ADR-0022) that seeds a shop's real
 * starting position. Zero-balance accounts are omitted — nothing to import
 * for them. Reuses the 'opening_balance' entry kind so it's picked up
 * wherever opening/seed postings are already recognised (e.g. the
 * reconciliation oracle's seed-capital calculation).
 *
 * Bardana bags already lent out (ADR-0022) fold into the farmer's opening
 * balance (subtract the outstanding bag value before calling this) rather
 * than a separate mechanism — there is no persisted bardana-loan tracking
 * yet (issue #21), and this keeps the money correctly reconciled from day
 * one without double-counting once that tracking lands. Godown stock already
 * held is deferred entirely to when Beopari/Godown persistence lands
 * (issue #28/#29) for the same reason.
 */
export function postGenesis(id: string, input: GenesisInput): Entry {
  const postings: Posting[] = []

  if (input.rokarOpening !== 0) {
    postings.push({ accountId: ROKAR_ID, amount: input.rokarOpening })
  }
  for (const f of input.farmerBalances) {
    if (f.balance !== 0) postings.push({ accountId: f.farmerId, amount: f.balance })
  }
  for (const b of input.buyerBalances) {
    if (b.balance !== 0) postings.push({ accountId: b.buyerId, amount: b.balance })
  }
  for (const c of input.contractorBalances) {
    if (c.balance !== 0) postings.push({ accountId: c.thekedarId, amount: c.balance })
  }

  if (postings.length === 0) {
    throw new Error('Genesis entry must import at least one non-zero opening balance')
  }

  return { id, kind: 'opening_balance', postings }
}

