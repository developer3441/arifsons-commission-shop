# ADR-0003 — Katt is a fixed kg-per-bag deduction

**Status:** accepted · **Date:** 2026-06-30

## Question
How is the Katt weight deduction computed now that we store gross kg per bag?

## Decision
**Deduct a configurable fixed amount of kg per bag** (default per the example, 1.5 kg),
covering empty-sack tare + immediate moisture allowance.

- `payable_kg(bag) = gross_kg − katt_kg_per_bag`
- `katt_kg_per_bag` is a setting: global default, overridable per-customer and per-invoice.
- Lot payable maunds = Σ payable_kg / 40 (see [ADR-0002](0002-weight-model.md)).

## Consequences
- Single knob, easy to explain to shopkeepers; matches the blueprint's 41.5→40 example.
- A bag heavier than 40 kg still pays for everything above the fixed deduction (no maund
  rounding loss) — correct behaviour for variable-weight bags.
- Guard: `payable_kg` must not go negative on light bags; clamp at 0 and warn.

## Open follow-ups
- Is Katt ever expressed as a % of gross for very wet crops? If so, add a per-crop mode later.
