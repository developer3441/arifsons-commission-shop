# ADR-0022 — Opening balances seeded via a one-time genesis entry

**Status:** accepted · **Date:** 2026-07-02

## Question
A real shop adopting this system is not empty: it already has cash in the drawer, farmers who owe
Peshi, bags already lent out, buyers who owe on won lots, maybe stock in the Godown. The
reconciliation invariant ([ADR-0010](0010-net-worth-definition.md)) also needs a **seed capital**
starting point. How do pre-existing balances enter an append-only stream ([ADR-0021](0021-ledger-write-integrity.md))?

## Decision
**Import full opening balances as a one-time "genesis" entry.** Onboarding posts a single dated
genesis entry that seeds the real starting position:

- opening **Rokar** cash,
- pre-existing **farmer** balances (outstanding Peshi debt as a debit; held credit as a credit),
- pre-existing **buyer** receivables,
- pre-existing **contractor** balances owed,
- **bardana** already lent out (bags-out asset),
- **Godown** stock already held (bags, net kg, cost basis).

The genesis entry is an ordinary set of postings (so it flows through the same projections and the
same append-only guarantees) and carries the shop's **opening business date**
([ADR-0023](0023-business-dating-timezone.md)).

**Seed capital** for the reconciliation oracle = the shop's opening **equity** at genesis
(opening assets − opening liabilities), i.e. the net worth the genesis entry establishes. From that
point True Shop Value should equal seed + retained profit ± open trading P&L with **zero** drift
([ADR-0010](0010-net-worth-definition.md), [ADR-0009](0009-currency-and-precision.md)).

## Consequences
- The shop can be adopted **mid-cycle** without losing standing debts, credits, bags, or stock.
- Because the genesis entry uses the normal posting path, no special-case balance logic is needed;
  it is just the first entry in the stream.
- Onboarding must gather these opening figures once; getting them right is what makes the very first
  reconciliation balance.
- Genesis is Owner-only ([ADR-0020](0020-security-auth-model.md)) and, like any posting, is
  append-only ([ADR-0021](0021-ledger-write-integrity.md)) — a mistake is corrected by a further
  adjusting entry, not by rewriting genesis.

## Open follow-ups
- None.
