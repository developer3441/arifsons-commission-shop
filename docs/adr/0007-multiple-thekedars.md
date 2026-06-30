# ADR-0007 — Multiple Thekedar (labour contractor) accounts

**Status:** accepted · **Date:** 2026-06-30

## Question
One centralized labour account (blueprint) or many contractor accounts?

## Decision
**Many.** Each Thekedar is its own account, structurally like farmer/buyer accounts. Each
lot's labour charge routes to a **chosen contractor**.

## Consequences
- `labor_ledger` becomes a per-contractor ledger (one balance each), not a single pool.
- The single-entry invoice needs a "labour contractor" selector per lot (default = last used /
  a configured primary).
- Payout (cash-out) is per contractor; True Shop Value sums all contractor balances as the
  outstanding-labour liability.
- Supersedes the blueprint's "single centralized account" wording in §5 / Khata 4.
