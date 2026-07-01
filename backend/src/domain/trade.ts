// The trade engine: turns one mandi sale into ledger postings plus the farmer's
// Kacha bill and the buyer's Pakka invoice. Pure — no I/O (ADR-0013).
//
// Sign model (ADR-0010): negative = "owes the shop" (an asset); positive =
// "the shop owes" (a liability). A sale posts the buyer negative (receivable),
// the farmer positive (payout owed), the contractor positive (wages owed), and
// revenue positive (commission earned) — and the four sum to zero.

import { type PKR, pkr, negatePkr, roundToPkr } from './money'
import { type Posting, REVENUE_ID } from './posting'

/** One sale line: a quantity of a lot sold to one buyer at a rate. */
export interface SaleLine {
  buyerId: string
  payableMaunds: number // 2dp; no Katt deduction in issue #2
  ratePerMaund: number // whole PKR per maund
}

/** A single-buyer trade entry (issue #2: one lot, one line). */
export interface TradeEntry {
  id: string
  farmerId: string
  thekedarId: string
  bags: number
  line: SaleLine
}

export interface TradeConfig {
  farmerCommissionRate: number // e.g. 0.02 for 2%
  perBagLabour: number // whole PKR per bag
}

/** The farmer's Kacha bill — what the shop owes the farmer, itemised. */
export interface FarmerBill {
  gross: PKR
  commission: PKR
  labour: PKR
  net: PKR
}

/** The buyer's Pakka invoice — what the buyer owes the shop. */
export interface BuyerInvoice {
  buyerId: string
  gross: PKR
}

export interface TradeResult {
  postings: Posting[]
  farmerBill: FarmerBill
  buyerInvoice: BuyerInvoice
}

/**
 * Post a single-buyer sale. Commission base is rate × payable maunds (ADR-0012);
 * labour is per-bag routed to one contractor (ADR-0007). Each line total is
 * rounded once to whole PKR (ADR-0009).
 */
export function postTradeEntry(entry: TradeEntry, config: TradeConfig): TradeResult {
  const { line } = entry
  const gross = roundToPkr(line.payableMaunds * line.ratePerMaund)
  const commission = roundToPkr(line.payableMaunds * line.ratePerMaund * config.farmerCommissionRate)
  const labour = roundToPkr(entry.bags * config.perBagLabour)
  const net = pkr(gross - commission - labour)

  const postings: Posting[] = [
    { accountId: line.buyerId, amount: negatePkr(gross) }, // buyer owes the shop
    { accountId: entry.farmerId, amount: net }, // shop owes the farmer
    { accountId: entry.thekedarId, amount: labour }, // shop owes the contractor
    { accountId: REVENUE_ID, amount: commission }, // commission earned (Amdani)
  ]

  return {
    postings,
    farmerBill: { gross, commission, labour, net },
    buyerInvoice: { buyerId: line.buyerId, gross },
  }
}
