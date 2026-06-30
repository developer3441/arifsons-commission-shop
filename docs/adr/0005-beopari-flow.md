# ADR-0005 — Beopari (own-trading) modelled as the shop acting as an internal buyer

**Status:** accepted · **Date:** 2026-06-30

## Question
When the shop outbids the mills and buys a lot itself, how is the transaction modelled?

## Decision
**Reuse the auction flow with the shop as an internal "house" buyer account.**

- The single-entry invoice runs normally; the winning buyer is the shop's house account.
- The farmer is still charged commission + labour exactly as a normal sale (subject to the
  [ADR-0001](0001-bardana-and-labor-cost-bearer.md) bearer toggle).
- On save, instead of a buyer receivable, the lot moves into the **Godown / Mal Khata** at
  cost = winning bid + haul-in labour (per §Khata 5 average-cost rule).
- Cash to the farmer is paid as usual from Rokar.

## Consequences
- One auction code path serves both Arhat and Beopari; the only branch is buyer = house.
- **Self-commission:** the shop charges itself commission. Net effect = the commission income
  is offset by being part of the stock's cost basis. Must verify this doesn't double-count in
  net worth; the revenue ledger should likely EXCLUDE self-commission, or the stock cost basis
  must include it consistently. **Flagged for a follow-up ADR if reconciliation breaks.**
- Stock is later flipped to a real buyer; trading profit = sale − average cost basis, booked
  separately from commission income.

## Open follow-ups
- Decide whether self-commission is booked as revenue or suppressed (reconciliation test will decide).
