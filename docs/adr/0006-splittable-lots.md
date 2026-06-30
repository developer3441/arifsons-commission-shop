# ADR-0006 — Lots are splittable across multiple buyers

**Status:** accepted · **Date:** 2026-06-30

## Question
Whole lot to one buyer (blueprint) or splittable across buyers?

## Decision
**Splittable.** A lot's bags may be sold to multiple buyers, potentially at different rates
(partial sales).

## Consequences
- Data model: a lot has one or more **sale lines**, each = (buyer, bag subset / quantity,
  rate per maund). The single-entry invoice aggregates these.
- Each sale line generates its own buyer (Pakka) impact; the farmer (Kacha) bill is the sum
  across all lines for that lot.
- Commission, labour, bardana, katt, and cess all compute **per sale line**, then roll up.
- Bag/quantity accounting must ensure Σ(sold) ≤ lot's bag count; track unsold remainder.
- Pairs naturally with Beopari ([ADR-0005](0005-beopari-flow.md)): one line can go to the
  house buyer while others go to mills.
