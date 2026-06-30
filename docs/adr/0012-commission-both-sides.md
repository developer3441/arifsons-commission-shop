# ADR-0012 — Commission is charged on both sides, configurable

**Status:** accepted · **Date:** 2026-06-30

## Question
The blueprint charges commission only to the farmer. Many mandis also charge the buyer
("pakka arhat"). What does v1 support?

## Decision
**Both sides, independently configurable.** Separate **farmer-side** and **buyer-side**
commission rates, each adjustable per customer; either may be 0.

- Base for each: **gross sale value of the line = rate per maund × payable maunds**
  (post-katt — see [ADR-0002](0002-weight-model.md)/[ADR-0003](0003-katt-mechanics.md)).
- Farmer-side commission is a deduction on the Kacha bill; buyer-side commission is an
  addition on the Pakka bill.
- Defaults: farmer-side = global default (e.g. 6%), buyer-side = 0 unless configured.
  Per-customer overrides apply ([blueprint §3.1](../../README_1.md)).

## Consequences
- Commission settings model needs two rates per customer (or per role), not one.
- Both commissions are **shop income** → revenue ledger (distinct from cess, which is a
  liability per [ADR-0004](0004-cess-government-liability-pool.md)).
- Computed per sale line, rolled up per lot ([ADR-0006](0006-splittable-lots.md)).

## Open follow-ups
- Confirm whether buyer-side commission is per-maund flat in some markets vs percentage.
