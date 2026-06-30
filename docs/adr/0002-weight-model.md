# ADR-0002 — Canonical weight model: gross kg per bag → payable maunds

**Status:** accepted · **Date:** 2026-06-30

## Question
The blueprint quotes auction price per 40 kg maund and uses Katt to lock each bag to 40 kg,
but the simulation prices per BAG and treats 1 bag = 1 maund = exactly 40 kg. Real bags vary
(45–100 kg). What is the canonical weight unit?

## Decision
**Track gross kg per bag.** Bag count and weight are independent dimensions.

- Each bag (or weigh-record) stores its **gross kg** as weighed (`taulai`).
- **Katt** (see [ADR-0003](0003-katt-mechanics.md)) reduces gross → **payable weight**.
- Payable weight is expressed in **maunds** (1 maund = 40 kg, fixed constant).
- **Sale value = auction rate (PKR per maund) × payable maunds.**

The simulation's "price per bag" is a special case where every bag is exactly 1 maund; it is
NOT the canonical model.

## Consequences
- Data model: a lot has many bags/weigh-records; each has gross_kg. Lot payable maunds =
  Σ(katt-adjusted kg) / 40.
- Labour fee stays **per bag** (a handling count), independent of weight — see labour model.
- Reporting needs both bag count (for labour, bardana) and net maunds (for pricing, stock).
- Glossary: `maund` and `katt` promoted from 🟡/❓; bag ≠ maund made explicit.
