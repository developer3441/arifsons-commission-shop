# ADR-0010 — True Shop Value is the full balance sheet (assets − liabilities)

**Status:** accepted · **Date:** 2026-06-30 · **Clarified:** 2026-07-02 (farmer-receivable + cess terms, average-cost valuation, exact-zero reconciliation — aligned to the tested engine)

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
  + Receivables owed by farmers (Zamindar debit balances, e.g. unrepaid Peshi)  ← symmetric with buyers
  + Godown stock at running average cost                                        ← average cost, not market
  + Value of bardana (bags) lent out / owed by farmers      ← the term §7 omitted
  − Payout balances owed to farmers (Zamindar credit balances)
  − Outstanding labour wages owed (Thekedar balance)
  − Cess held for the government (Government/Cess balance)   ← liability (ADR-0004)
```

Farmer balances count **both directions**: a debit balance (they owe the shop, e.g. an outstanding
advance) is an **asset**, exactly as a buyer debit is; a credit balance (the shop owes them) is a
**liability**. Omitting the debit side would show an outstanding Peshi as permanent reconciliation
drift — the same class of bug this ADR fixed for bardana.

The simulation's "cash − owed to farmers" is only an illustrative subset and is NOT the
canonical metric. The "5 missing bags" hand-wave disappears once bags-lent-out are counted
as the asset they are.

## Consequences
- The dashboard shows two pillars: **Cash in Hand** (Rokar only) and **True Shop Value** (above).
- A reconciliation invariant is still useful as a TEST: `True Shop Value` should equal
  `seed capital + retained profit (revenue ledger) ± open trading P&L`. **Drift must be exactly
  zero** — because money is rounded once at the line total ([ADR-0009](0009-currency-and-precision.md)),
  no rounding tolerance is needed; any non-zero drift flags a bug. Seed capital is the shop's opening
  equity ([ADR-0022](0022-opening-balances-genesis.md)). (This is the profit-based view, demoted from
  "authoritative metric" to "test oracle.")
- **Valuation — RESOLVED:** Godown stock is valued at its **running average cost** (never live
  market), so there is **no unrealised trading P&L** and the `open trading P&L` term is 0; profit is
  realised only on resale ([ADR-0005](0005-beopari-flow.md)). Bardana out is valued at the empty-bag
  value.

## Open follow-ups
- None — valuation (average cost) and the reconciliation tolerance (exact zero) are settled above.
