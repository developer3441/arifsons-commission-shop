// The trade engine: turns one mandi sale into ledger postings plus the farmer's
// Kacha bill and the buyer's Pakka invoice(s). Pure — no I/O (ADR-0013).
//
// Sign model (ADR-0010): negative = "owes the shop" (an asset); positive =
// "the shop owes" (a liability). A sale posts each buyer negative (receivable),
// the farmer positive (payout owed, rolled up across every line), the
// contractor positive (wages owed), and revenue positive (commission +
// bag-charge earned) — the whole entry sums to zero regardless of which side
// bears which charge (ADR-0001/0012) and how many lines the lot is split
// across (ADR-0006).

import { type PKR, pkr, addPkr, negatePkr, roundToPkr } from './money'
import { type Posting, REVENUE_ID, GOVERNMENT_ID } from './posting'
import { type Bag, payableMaunds } from './weight'

/** Who a bag/labour charge is billed to (ADR-0001). */
export type CostBearer = 'farmer' | 'buyer'

/**
 * One sale line: some of the lot's weighed bags sold to one buyer at a rate.
 * A lot may carry 2+ lines, each to a possibly different buyer at a possibly
 * different rate (ADR-0006, issue #9). Payable maunds are derived from the
 * canonical weight pipeline (ADR-0002/0003) per line.
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

/**
 * A trade entry: one lot, one farmer, one labour contractor, one or more sale
 * lines. `lotBags` is the lot's total bag count available to sell — the guard
 * against oversell (ADR-0006).
 */
export interface TradeEntry {
  id: string
  farmerId: string
  thekedarId: string
  lotBags: number
  lines: readonly SaleLine[]
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

/** The farmer's Kacha bill — one bill for the whole lot, summed across every line. */
export interface FarmerBill {
  gross: PKR
  commission: PKR
  labour: PKR // 0 portion when labour is buyer-borne, summed across lines
  bagCharge: PKR // 0 portion when the bag charge is buyer-borne, summed across lines
  net: PKR
}

/** One buyer's Pakka invoice — each sale line yields its own (ADR-0006). */
export interface BuyerInvoice {
  buyerId: string
  saleValue: PKR // this line's sale value alone, unaffected by cost-bearer choices
  commission: PKR // buyer-side commission add-on (ADR-0012)
  labourCharge: PKR // labour, only when buyer-borne
  bagCharge: PKR // bag charge, only when buyer-borne
  cess: PKR // regulatory cess — collected for the government, never shop income (ADR-0004)
  total: PKR // what this buyer owes in total for this line
}

export interface TradeResult {
  postings: Posting[]
  farmerBill: FarmerBill
  buyerInvoices: BuyerInvoice[] // one per sale line, in line order
  payableMaunds: number // summed across every line
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

interface LineComputation {
  buyerInvoice: BuyerInvoice
  buyerPosting: Posting
  maunds: number
  farmerGross: PKR
  farmerCommission: PKR
  farmerLabour: PKR
  farmerBagCharge: PKR
  labourToThekedar: PKR
  revenueShare: PKR
  cess: PKR
}

/**
 * Compute one sale line in isolation: weight -> Katt -> payable maunds
 * (ADR-0002/0003), both-side commission (ADR-0012), and cost-bearer routing
 * for the bag/labour charges (ADR-0001). Every line total is rounded once
 * (ADR-0009).
 */
function computeLine(entry: TradeEntry, line: SaleLine, config: TradeConfig): LineComputation {
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
  const cess = roundToPkr(saleValue * config.cessRate)

  const farmerLabour = labourBearer === 'farmer' ? labour : pkr(0)
  const buyerLabour = labourBearer === 'buyer' ? labour : pkr(0)
  const farmerBagCharge = bagBearer === 'farmer' ? bagCharge : pkr(0)
  const buyerBagCharge = bagBearer === 'buyer' ? bagCharge : pkr(0)

  const buyerTotal = pkr(saleValue + buyerCommission + buyerLabour + buyerBagCharge + cess)
  const revenueShare = addPkr(addPkr(farmerCommission, buyerCommission), bagCharge)

  return {
    buyerInvoice: {
      buyerId: line.buyerId,
      saleValue,
      commission: buyerCommission,
      labourCharge: buyerLabour,
      bagCharge: buyerBagCharge,
      cess,
      total: buyerTotal,
    },
    buyerPosting: { accountId: line.buyerId, amount: negatePkr(buyerTotal) },
    maunds,
    farmerGross: saleValue,
    farmerCommission,
    farmerLabour,
    farmerBagCharge,
    labourToThekedar: labour,
    revenueShare,
    cess,
  }
}

/**
 * Post a lot's sale, split across one or more buyer lines (ADR-0006). Per-line
 * charges compute independently, then roll up: one Kacha bill for the farmer,
 * one contractor posting, one revenue posting — but each line keeps its own
 * Pakka invoice/posting since a split lot can have different buyers. Rejects
 * an oversell (more bags sold across lines than the lot has).
 */
export function postTradeEntry(entry: TradeEntry, config: TradeConfig): TradeResult {
  const totalBagsSold = entry.lines.reduce((sum, line) => sum + line.bags.length, 0)
  if (totalBagsSold > entry.lotBags) {
    throw new RangeError(
      `Oversell: ${totalBagsSold} bags sold across lines exceeds the lot's ${entry.lotBags} bags`,
    )
  }
  if (entry.lines.length === 0) {
    throw new RangeError('A trade entry needs at least one sale line')
  }

  const lineResults = entry.lines.map((line) => computeLine(entry, line, config))

  let maunds = 0
  let farmerGross = pkr(0)
  let farmerCommission = pkr(0)
  let farmerLabour = pkr(0)
  let farmerBagCharge = pkr(0)
  let labourToThekedar = pkr(0)
  let revenue = pkr(0)
  let cess = pkr(0)

  for (const r of lineResults) {
    maunds += r.maunds
    farmerGross = addPkr(farmerGross, r.farmerGross)
    farmerCommission = addPkr(farmerCommission, r.farmerCommission)
    farmerLabour = addPkr(farmerLabour, r.farmerLabour)
    farmerBagCharge = addPkr(farmerBagCharge, r.farmerBagCharge)
    labourToThekedar = addPkr(labourToThekedar, r.labourToThekedar)
    revenue = addPkr(revenue, r.revenueShare)
    cess = addPkr(cess, r.cess)
  }

  const farmerNet = pkr(farmerGross - farmerCommission - farmerLabour - farmerBagCharge)

  const postings: Posting[] = [
    ...lineResults.map((r) => r.buyerPosting), // each line's buyer owes the shop
    { accountId: entry.farmerId, amount: farmerNet }, // shop owes the farmer, rolled up
    { accountId: entry.thekedarId, amount: labourToThekedar }, // shop owes the contractor
    { accountId: REVENUE_ID, amount: revenue }, // commission (both sides) + bag charge — never cess
    ...(cess > 0 ? [{ accountId: GOVERNMENT_ID, amount: cess }] : []), // cess is a liability (ADR-0004)
  ]

  return {
    postings,
    farmerBill: { gross: farmerGross, commission: farmerCommission, labour: farmerLabour, bagCharge: farmerBagCharge, net: farmerNet },
    buyerInvoices: lineResults.map((r) => r.buyerInvoice),
    payableMaunds: maunds,
  }
}
