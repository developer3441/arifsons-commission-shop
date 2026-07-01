# ADR-0005 — Beopari (own-trading) modelled as the shop acting as an internal buyer

**Status:** accepted · **Date:** 2026-06-30 · **Clarified:** 2026-07-02 (cost basis + self-commission resolved to match the implemented, reconciliation-tested engine)

## Question
When the shop outbids the mills and buys a lot itself, how is the transaction modelled?

## Decision
**Reuse the auction flow with the shop as an internal "house" buyer account.**

- The single-entry invoice runs normally; the winning buyer is the shop's house account.
- The farmer is still charged commission + labour exactly as a normal sale (subject to the
  [ADR-0001](0001-bardana-and-labor-cost-bearer.md) bearer toggle).
- On save, instead of a buyer receivable, the lot moves into the **Godown / Mal Khata** at
  **cost = the farmer's net Kacha bill + the full labour paid to the contractor** — i.e. the shop's
  real payout obligation for the lot. *(This corrects the original "winning bid + haul-in labour"
  wording, which double-counted: the farmer's net already nets out any self-charged
  commission/bag-charge, so cost basis must be built from that net, not the raw bid. This is what
  makes a house purchase exactly net-worth-neutral at the moment of purchase — Godown asset in,
  farmer + contractor liabilities out, zero net change.)*
- Cash to the farmer is paid as usual from Rokar.
- **Godown valuation & resale (§Khata 5):** stock is valued at its **running average cost per kg**
  (never live market price — so there is no unrealised P&L). A resale to a real buyer computes
  **cost of goods sold = kg sold × average cost**, realises **trading P&L = proceeds − COGS** to the
  revenue ledger, and **rejects** selling more bags/kg than the Godown holds
  ([ADR-0019](0019-guard-rails-reject-impossible.md)).

## Consequences
- One auction code path serves both Arhat and Beopari; the only branch is buyer = house.
- **Self-commission — RESOLVED (suppress):** a house purchase books **no** commission or bag-charge
  to the revenue ledger. Because the Godown cost basis is the farmer's **net** (which already nets
  out any self-charge), booking self-commission as revenue too would double-count. The reconciliation
  oracle ([ADR-0010](0010-net-worth-definition.md)) confirms this choice balances to zero drift.
- Stock is later flipped to a real buyer; **trading profit = proceeds − average cost basis**, booked
  to revenue but reported separately from commission income.

## Open follow-ups
- None — self-commission (suppress) and cost basis (farmer net + labour) are settled above.
