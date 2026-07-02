// Issue #12 — Dashboard + reconciliation oracle (capstone). Surfaces the two
// headline pillars (Cash in Hand, True Shop Value) and the reconciliation
// invariant that proves the whole engine is internally consistent (ADR-0010):
// True Shop Value should equal seed capital + retained profit (± open trading
// P&L). Any drift flags a bug.
//
// This module also resolves two open follow-ups the preceding ADRs flagged:
//
//  - ADR-0005 self-commission: a house (Beopari) purchase never books
//    commission/bag-charge to revenue (trade.ts's isHousePurchase guard), and
//    the Godown cost basis is farmerNet + labour, not the raw bid
//    (godown.ts's houseBuyCost) — together these make a house purchase
//    exactly net-worth-neutral at purchase time. Trading profit is realised
//    (and booked to revenue) only on resale.
//  - ADR-0010/0005 stock valuation: Godown stock is valued at its running
//    average COST basis, never live market price — so there is no unrealised
//    trading P&L term; the `openTradingPnL` parameter defaults to 0.
//  - A correction to ADR-0010's stated formula: the ADR only counts farmer
//    *credit* balances (payouts owed) as a liability, omitting farmer *debit*
//    balances (e.g. an unrepaid Peshi advance) as the receivable/asset they
//    are — symmetric with how buyer debit balances are already counted. Left
//    out, an outstanding advance would show as a permanent reconciliation
//    drift; this is the exact class of bug ADR-0010 itself was written to
//    close for bardana. Included here as `farmerReceivables`; worth folding
//    back into the ADR text as a follow-up.

import { type PKR, pkr, addPkr, negatePkr } from './money'
import { balanceOf, sumBalancesOf, ROKAR_ID, REVENUE_ID, GOVERNMENT_ID, type Entry } from './posting'
import { type GodownState } from './godown'
import { type BardanaLoan, totalBardanaOutValue } from './bardana'

/** Cash in Hand — the Rokar ledger alone (ADR-0010's first dashboard pillar). */
export function cashInHand(stream: readonly Entry[]): PKR {
  return balanceOf(stream, ROKAR_ID)
}

/** Sum only the positive (credit) balances across a set of accounts — a liability term. */
function sumCreditBalances(stream: readonly Entry[], accountIds: readonly string[]): PKR {
  return accountIds.reduce((sum, id) => {
    const balance = balanceOf(stream, id)
    return addPkr(sum, balance > 0 ? balance : pkr(0))
  }, pkr(0))
}

/** Sum only the magnitude of negative (debit) balances — a receivable/asset term. */
function sumDebitBalanceMagnitudes(stream: readonly Entry[], accountIds: readonly string[]): PKR {
  return accountIds.reduce((sum, id) => {
    const balance = balanceOf(stream, id)
    return addPkr(sum, balance < 0 ? negatePkr(balance) : pkr(0))
  }, pkr(0))
}

export interface TrueShopValueInputs {
  stream: readonly Entry[]
  buyerAccountIds: readonly string[] // Pakka (external buyer) accounts — receivables
  farmerAccountIds: readonly string[] // Zamindar accounts — both directions matter
  thekedarAccountIds: readonly string[] // outstanding labour liability
  godown: GodownState // valued at running average cost (Khata 5)
  bardanaLoans: readonly BardanaLoan[] // bags lent out, an asset (ADR-0010)
}

export interface TrueShopValueBreakdown {
  cash: PKR
  buyerReceivables: PKR
  farmerReceivables: PKR // e.g. an unrepaid Peshi advance — an asset (see module comment)
  godownValue: PKR
  bardanaOutValue: PKR
  farmerPayoutsOwed: PKR
  outstandingLabour: PKR
  cessHeld: PKR
  total: PKR
}

/**
 * True Shop Value — the full balance sheet (ADR-0010), the second dashboard
 * pillar: cash + receivables (buyer and farmer) + Godown stock + bardana lent
 * out − farmer payouts owed − outstanding labour − cess held.
 */
export function trueShopValue(inputs: TrueShopValueInputs): TrueShopValueBreakdown {
  const cash = cashInHand(inputs.stream)
  const buyerReceivables = sumDebitBalanceMagnitudes(inputs.stream, inputs.buyerAccountIds)
  const farmerReceivables = sumDebitBalanceMagnitudes(inputs.stream, inputs.farmerAccountIds)
  const godownValue = inputs.godown.totalCostBasis
  const bardanaOutValue = totalBardanaOutValue(inputs.bardanaLoans)
  const farmerPayoutsOwed = sumCreditBalances(inputs.stream, inputs.farmerAccountIds)
  const outstandingLabour = sumBalancesOf(inputs.stream, inputs.thekedarAccountIds)
  const cessHeld = balanceOf(inputs.stream, GOVERNMENT_ID)

  const total = pkr(
    cash +
      buyerReceivables +
      farmerReceivables +
      godownValue +
      bardanaOutValue -
      farmerPayoutsOwed -
      outstandingLabour -
      cessHeld,
  )

  return {
    cash,
    buyerReceivables,
    farmerReceivables,
    godownValue,
    bardanaOutValue,
    farmerPayoutsOwed,
    outstandingLabour,
    cessHeld,
    total,
  }
}

/** Retained profit — the revenue ledger balance (the profit-based oracle input, ADR-0010). */
export function retainedProfit(stream: readonly Entry[]): PKR {
  return balanceOf(stream, REVENUE_ID)
}

export interface ReconciliationResult {
  trueShopValue: PKR
  expected: PKR // seed + retained profit ± open trading P&L
  drift: PKR // trueShopValue − expected; should be 0
  reconciles: boolean
}

/**
 * The reconciliation invariant (ADR-0010): True Shop Value should equal seed
 * capital + retained profit (± any open/unrealised trading P&L — 0 by default
 * since Godown is valued at cost, not market, so nothing is unrealised). Any
 * drift flags a bug.
 */
export function reconcile(
  seedCapital: PKR,
  inputs: TrueShopValueInputs,
  openTradingPnL: PKR = pkr(0),
): ReconciliationResult {
  const tsv = trueShopValue(inputs).total
  const expected = pkr(seedCapital + retainedProfit(inputs.stream) + openTradingPnL)
  const drift = pkr(tsv - expected)
  return { trueShopValue: tsv, expected, drift, reconciles: drift === 0 }
}

/** Drill down into one ledger account: every entry that touches it, in stream order. */
export function entriesForAccount(stream: readonly Entry[], accountId: string): Entry[] {
  return stream.filter((entry) => entry.postings.some((p) => p.accountId === accountId))
}

/** One line of the Rokar cash book (issue #27). */
export interface CashBookLine {
  entryId: string
  kind: Entry['kind']
  /** Signed amount this entry moved through Rokar: positive = cash in, negative = cash out. */
  amount: PKR
  /** The running Rokar balance immediately after this entry. */
  balanceAfter: PKR
}

/**
 * The Rokar cash book (issue #27): every entry that moved physical cash, in
 * stream order, with a running balance. A projection only — never stored,
 * always derived fresh from the posting stream (architecture.md), same
 * pattern as farmerStatement (settlement.ts).
 */
export function cashBook(stream: readonly Entry[]): CashBookLine[] {
  const touching = entriesForAccount(stream, ROKAR_ID)
  let balance = pkr(0)
  const lines: CashBookLine[] = []
  for (const entry of touching) {
    const amount = entry.postings
      .filter((p) => p.accountId === ROKAR_ID)
      .reduce((sum, p) => pkr(sum + p.amount), pkr(0))
    balance = pkr(balance + amount)
    lines.push({ entryId: entry.id, kind: entry.kind, amount, balanceAfter: balance })
  }
  return lines
}

/** One line of a generic per-account statement (issue #31's ledger drill-down). */
export interface AccountStatementLine {
  entryId: string
  kind: Entry['kind']
  /** Signed amount this entry posted to the account. */
  amount: PKR
  /** The account's running balance immediately after this entry. */
  balanceAfter: PKR
}

/**
 * A generic drill-down for any of the 7 ledgers' accounts (issue #31,
 * ADR-0004/0010): every entry that touched this one account, in stream
 * order, with the running balance after each. Same "projection, never
 * stored" pattern as farmerStatement (settlement.ts, issue #26) and
 * cashBook (issue #27) — kept as its own function rather than reusing
 * those two so this generic Ledgers screen doesn't couple to either's
 * kind-specific behaviour (farmerStatement's settlement cascade only makes
 * sense for a Zamindar account; cashBook is Rokar-only).
 */
export function accountStatement(stream: readonly Entry[], accountId: string): AccountStatementLine[] {
  const touching = entriesForAccount(stream, accountId)
  let balance = pkr(0)
  const lines: AccountStatementLine[] = []
  for (const entry of touching) {
    const amount = entry.postings
      .filter((p) => p.accountId === accountId)
      .reduce((sum, p) => addPkr(sum, p.amount), pkr(0))
    balance = addPkr(balance, amount)
    lines.push({ entryId: entry.id, kind: entry.kind, amount, balanceAfter: balance })
  }
  return lines
}
