// The trade engine: turns one mandi sale into ledger postings plus the farmer's
// Kacha bill and the buyer's Pakka invoice. Pure — no I/O (ADR-0013).
//
// Sign model (ADR-0010): negative = "owes the shop" (an asset); positive =
// "the shop owes" (a liability). A sale posts the buyer negative (receivable),
// the farmer positive (payout owed), the contractor positive (wages owed), and
// revenue positive (commission + bag-charge earned) — and the four sum to zero,
// regardless of which side (farmer/buyer) bears which charge (ADR-0001/0012).

import { type PKR, pkr, addPkr, negatePkr, roundToPkr } from './money'
import { type Posting, REVENUE_ID, GOVERNMENT_ID } from './posting'
import { type Bag, payableMaunds } from './weight'

/** Who a bag/labour charge is billed to (ADR-0001). */
export type CostBearer = 'farmer' | 'buyer'

/**
 * One sale line: the lot's weighed bags sold to one buyer at a rate. Payable
 * maunds are derived from the canonical weight pipeline (ADR-0002/0003), not
 * carried directly — issue #3 replaces the issue #2 simplified shortcut.
 */
export interface SaleLine {
  buyerId: string
  bags: readonly Bag[]
  ratePerMaund: number // whole PKR per maund
  /** Per-invoice Katt override — highest precedence (ADR-0003). */
  kattKgPerBag?: number
  /** Per-invoice bag-cost-bearer override — highest precedence (ADR-0001). */
  bagBearer?: CostBearer
  /** Per-invoice labour-cost-bearer override — highest precedence (ADR-0001). */
  labourBearer?: CostBearer
}

/** A single-buyer trade entry (issue #2: one lot, one line). */
export interface TradeEntry {
  id: string
  farmerId: string
  thekedarId: string
  line: SaleLine
}

export interface TradeConfig {
  farmerCommissionRate: number // e.g. 0.02 for 2%; deduction on the Kacha bill
  buyerCommissionRate: number // e.g. 0 by default; addition on the Pakka invoice (ADR-0012)
  perBagLabour: number // whole PKR per bag
  perBagCharge: number // whole PKR per bag — bardana/bag cost (ADR-0001); 0 if not charged
  /** Global default bearer for the per-bag charge. Default: farmer. */
  bagBearer: CostBearer
  /** Global default bearer for the labour charge. Default: farmer. */
  labourBearer: CostBearer
  /** Cess rate on sale value, added to the Pakka invoice (ADR-0004). Default: 0. */
  cessRate: number
  /** Global default Katt, kg per bag (ADR-0003). Lowest precedence. */
  kattKgPerBag: number
  /** Per-customer Katt override, keyed by farmerId. Middling precedence. */
  customerKattKgPerBag?: Readonly<Record<string, number>>
  /** Per-customer bag-bearer override, keyed by farmerId. Middling precedence. */
  customerBagBearer?: Readonly<Record<string, CostBearer>>
  /** Per-customer labour-bearer override, keyed by farmerId. Middling precedence. */
  customerLabourBearer?: Readonly<Record<string, CostBearer>>
}

/** The farmer's Kacha bill — what the shop owes the farmer, itemised. */
export interface FarmerBill {
  gross: PKR
  commission: PKR
  labour: PKR // 0 when labour is buyer-borne
  bagCharge: PKR // 0 when the bag charge is buyer-borne
  net: PKR
}

/** The buyer's Pakka invoice — what the buyer owes the shop. */
export interface BuyerInvoice {
  buyerId: string
  saleValue: PKR // the sale value alone, unaffected by cost-bearer choices
  commission: PKR // buyer-side commission add-on (ADR-0012)
  labourCharge: PKR // labour, only when buyer-borne
  bagCharge: PKR // bag charge, only when buyer-borne
  cess: PKR // regulatory cess — collected for the government, never shop income (ADR-0004)
  total: PKR // what the buyer owes in total
}

export interface TradeResult {
  postings: Posting[]
  farmerBill: FarmerBill
  buyerInvoice: BuyerInvoice
  payableMaunds: number
}

/** Per-invoice override > per-customer override > global default (ADR-0001/0003). */
function resolve<T>(
  perInvoice: T | undefined,
  farmerId: string,
  perCustomer: Readonly<Record<string, T>> | undefined,
  globalDefault: T,
): T {
  return perInvoice ?? perCustomer?.[farmerId] ?? globalDefault
}

/**
 * Post a single-buyer sale. Weight runs through the canonical Katt -> payable
 * maunds pipeline (ADR-0002/0003) before pricing. Commission is charged on
 * both sides independently (ADR-0012). Bag and labour charges each carry a
 * configurable cost bearer (ADR-0001): a buyer-borne charge moves onto the
 * Pakka invoice instead of deducting from the Kacha bill — the recipient (the
 * contractor for labour, shop revenue for the bag charge) is paid either way;
 * only who funds it changes. Every line total is rounded once (ADR-0009).
 */
export function postTradeEntry(entry: TradeEntry, config: TradeConfig): TradeResult {
  const { line } = entry
  const katt = resolve(line.kattKgPerBag, entry.farmerId, config.customerKattKgPerBag, config.kattKgPerBag)
  const bagBearer = resolve(line.bagBearer, entry.farmerId, config.customerBagBearer, config.bagBearer)
  const labourBearer = resolve(
    line.labourBearer,
    entry.farmerId,
    config.customerLabourBearer,
    config.labourBearer,
  )

  const maunds = payableMaunds(line.bags, katt)
  const saleValue = roundToPkr(maunds * line.ratePerMaund)
  const farmerCommission = roundToPkr(saleValue * config.farmerCommissionRate)
  const buyerCommission = roundToPkr(saleValue * config.buyerCommissionRate)
  const labour = roundToPkr(line.bags.length * config.perBagLabour)
  const bagCharge = roundToPkr(line.bags.length * config.perBagCharge)

  const farmerLabour = labourBearer === 'farmer' ? labour : pkr(0)
  const buyerLabour = labourBearer === 'buyer' ? labour : pkr(0)
  const farmerBagCharge = bagBearer === 'farmer' ? bagCharge : pkr(0)
  const buyerBagCharge = bagBearer === 'buyer' ? bagCharge : pkr(0)

  const cess = roundToPkr(saleValue * config.cessRate)

  const net = pkr(saleValue - farmerCommission - farmerLabour - farmerBagCharge)
  const buyerTotal = pkr(saleValue + buyerCommission + buyerLabour + buyerBagCharge + cess)
  const revenue = addPkr(addPkr(farmerCommission, buyerCommission), bagCharge)

  const postings: Posting[] = [
    { accountId: line.buyerId, amount: negatePkr(buyerTotal) }, // buyer owes the shop
    { accountId: entry.farmerId, amount: net }, // shop owes the farmer
    { accountId: entry.thekedarId, amount: labour }, // shop owes the contractor (paid either way)
    { accountId: REVENUE_ID, amount: revenue }, // commission (both sides) + bag charge earned — never cess
    ...(cess > 0 ? [{ accountId: GOVERNMENT_ID, amount: cess }] : []), // cess is a liability, not income (ADR-0004)
  ]

  return {
    postings,
    farmerBill: { gross: saleValue, commission: farmerCommission, labour: farmerLabour, bagCharge: farmerBagCharge, net },
    buyerInvoice: {
      buyerId: line.buyerId,
      saleValue,
      commission: buyerCommission,
      labourCharge: buyerLabour,
      bagCharge: buyerBagCharge,
      cess,
      total: buyerTotal,
    },
    payableMaunds: maunds,
  }
}
