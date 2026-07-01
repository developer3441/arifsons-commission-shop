// Beopari (own-trading): the shop as an internal house buyer (ADR-0005). The
// normal auction/trade flow (trade.ts) is reused unchanged — the only branch
// is that the winning buyer is the shop's own house account. This module is
// the Godown/Mal Khata: stock lands here at cost (winning bid + haul-in
// labour) with a running average cost per kg (blueprint Khata 5). A later
// resale realises trading P&L — kept itemised separately from commission
// income, even though with exactly 7 ledgers (ADR-0004) both still post to
// the same revenue account.
//
// Open follow-up (ADR-0005): whether self-commission on a house purchase is
// booked as revenue or suppressed is left to the issue #12 reconciliation
// oracle to decide — this module does not resolve it.

import { type PKR, pkr, addPkr, roundToPkr } from './money'
import { type Account } from './posting'

/** The shop's internal house-buyer account for Beopari (own-trading) (ADR-0005). */
export const HOUSE_BUYER_ID = 'house'

export function houseBuyerAccount(): Account {
  return { id: HOUSE_BUYER_ID, kind: 'beopari' }
}

/** One parcel of stock received into the Godown, valued at cost. */
export interface StockLot {
  bags: number
  netKg: number
  costBasis: PKR // winning bid + haul-in labour (ADR-0005)
}

/** Running Godown state: bag count, net kg, and total cost basis. */
export interface GodownState {
  bags: number
  netKg: number
  totalCostBasis: PKR
}

export function emptyGodown(): GodownState {
  return { bags: 0, netKg: 0, totalCostBasis: pkr(0) }
}

/** Cost of a house purchase = winning bid (sale value) + haul-in labour (ADR-0005). */
export function houseBuyCost(bidValue: PKR, haulInLabour: PKR): PKR {
  return addPkr(bidValue, haulInLabour)
}

/** Receive a new stock lot into the Godown, updating the running totals. */
export function receiveStock(state: GodownState, lot: StockLot): GodownState {
  return {
    bags: state.bags + lot.bags,
    netKg: state.netKg + lot.netKg,
    totalCostBasis: addPkr(state.totalCostBasis, lot.costBasis),
  }
}

/** The running average cost per kg — the Godown's Khata-5 valuation basis. */
export function averageCostPerKg(state: GodownState): number {
  if (state.netKg === 0) return 0
  return state.totalCostBasis / state.netKg
}

export interface ResaleResult {
  newState: GodownState
  costOfGoodsSold: PKR
  tradingPnL: PKR // sale proceeds − cost of goods sold, itemised separately from commission
}

/**
 * Sell stock out of the Godown to a real buyer, realising trading P&L at the
 * running average cost — separate from commission income (ADR-0005). Rejects
 * selling more stock (bags or net kg) than the Godown holds.
 */
export function resellStock(
  state: GodownState,
  bagsSold: number,
  netKgSold: number,
  saleProceeds: PKR,
): ResaleResult {
  if (bagsSold > state.bags || netKgSold > state.netKg) {
    throw new RangeError('Cannot sell more stock than the Godown holds')
  }
  const costOfGoodsSold = roundToPkr(netKgSold * averageCostPerKg(state))
  const tradingPnL = pkr(saleProceeds - costOfGoodsSold)
  const newState: GodownState = {
    bags: state.bags - bagsSold,
    netKg: state.netKg - netKgSold,
    totalCostBasis: pkr(state.totalCostBasis - costOfGoodsSold),
  }
  return { newState, costOfGoodsSold, tradingPnL }
}
