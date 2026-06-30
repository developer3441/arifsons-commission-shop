# ADR-0004 — Cess collected into a dedicated government liability pool (7th ledger)

**Status:** accepted · **Date:** 2026-06-30

## Question
The Pakka invoice adds regulatory cess on the buyer. Where does that money land?

## Decision
**A dedicated Government / Cess liability ledger — a 7th khata.** The shop is the collection
agent: it collects cess from the buyer, holds it as a liability, and remits it to the market
committee. It is **never shop income**.

- Behaves like the labour pool: accumulates a credit as lots sell, drops to zero on remittance.
- Excluded from commission/profit. Included in True Shop Value as a **liability**
  (money held but owed onward) — see [ADR-0010](0010-net-worth-definition.md).

## Consequences
- **⚠️ Architecture change: the "6-ledger matrix" becomes 7 ledgers.** Update the blueprint's
  §5 / Khata list and all "6 core khata" copy.
- New ledger: `govt_ledger` (Cess / Mandi Fee). Add to glossary and the ledger model.
- The True Shop Value formula gains a `− cess held & owed` liability term.

## Open follow-ups
- Cess rate(s): flat % of gross, or slab by commodity? Where configured (global/per-commodity)?
