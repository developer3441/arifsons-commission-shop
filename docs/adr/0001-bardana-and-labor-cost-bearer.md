# ADR-0001 — Bardana & labour cost bearer is configurable per deal

**Status:** accepted · **Date:** 2026-06-30

## Question
§3.3 says a borrowed bag's cost is "absorbed" when the farmer sells at your shop, but the
worked simulation keeps the 5-bag / 500 PKR debt on Farmer A forever (the source of the
1,360-vs-1,860 discrepancy). Which is the rule — does the farmer keep the bag debt or not?

## Decision
Neither is a fixed rule. **The bearer of both the bardana (bag) cost and the labour
(mazdoori) cost is a per-transaction choice: it can be charged to the SELLER (farmer) or to
the BUYER.** The blueprint's "absorbed" and the simulation's "standing debt" are just two
configurations of the same switch.

- Costs can be applied at **multiple levels** of a lot's life: when the crop arrives at the
  mandi (farmer side) and again when a buyer purchases (buyer side).
- Each charge line (`bag_charge`, `labor_charge`) carries a `bearer` field: `farmer | buyer`.
- **Default:** farmer bears both (matches the simulation and the common case). Configurable
  globally, per-customer, and overridable per single-entry invoice.

## Consequences
- The single-entry invoice must expose a bearer toggle on bag and labour lines.
- When `bearer = buyer`, the charge moves to the Pakka (buyer) invoice and the farmer's
  bag/labour debt nets to zero on that sale — this is the "absorbed" case.
- Net-worth reconciliation now depends on treating **bags lent out as an asset** (a farmer
  receivable or shop inventory-in-the-field), not a leak — see [ADR-0010](0010-net-worth-definition.md).
- Glossary: `bardana`, `mazdoori` updated; new term `cost_bearer`.

## Open follow-ups
- Confirm the exact default precedence (global vs per-customer vs per-invoice).
- Does a buyer-borne bag charge value the bag at the same 100 PKR, or a separate buyer rate?
