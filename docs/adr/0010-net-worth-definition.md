# ADR-0010 — True Shop Value is the full balance sheet (assets − liabilities)

**Status:** accepted · **Date:** 2026-06-30

## Question
Two conflicting net-worth formulas exist: §7's full balance sheet vs the simulation's
2-term dashboard (cash − farmer payouts) that needs a manual "+500 bag" fudge to reconcile.
Which is authoritative?

## Decision
**The full balance sheet is authoritative:**

```
True Shop Value =
    Cash on hand (Rokar)
  + Receivables owed by buyers/mills (Pakka debit balances)
  + Market value of Godown stock
  + Value of bardana (bags) lent out / owed by farmers      ← the term §7 omitted
  − Payout balances owed to farmers (Zamindar credit balances)
  − Outstanding labour wages owed (Thekedar balance)
```

The simulation's "cash − owed to farmers" is only an illustrative subset and is NOT the
canonical metric. The "5 missing bags" hand-wave disappears once bags-lent-out are counted
as the asset they are.

## Consequences
- The dashboard shows two pillars: **Cash in Hand** (Rokar only) and **True Shop Value** (above).
- A reconciliation invariant is still useful as a TEST: `True Shop Value` should equal
  `seed capital + retained profit (revenue ledger) ± open trading P&L`. Any drift flags a bug.
  (This is the profit-based view, demoted from "authoritative metric" to "test oracle.")
- Requires a valuation for: Godown stock (avg cost or market?) and bardana out (the 100 PKR
  empty-bag value). Stock valuation basis is a follow-up.

## Open follow-ups
- Godown stock valued at average cost or live market price? (affects unrealised trading P&L)
