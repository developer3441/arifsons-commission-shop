# ADR-0009 — Currency PKR, money in whole rupees, weight to 0.01 kg

**Status:** accepted · **Date:** 2026-06-30

## Question
How are money and weight stored and rounded?

## Decision
- **Single currency: PKR.**
- **Money: whole rupees** (no paisa). Round-half-up on the final computed line.
- **Weight: 2 decimal places (0.01 kg).**

## Consequences
- Store money as integer rupees (or a decimal with scale 0) to avoid float drift; weight as a
  decimal with scale 2.
- Rounding policy: compute intermediate values at full precision, round **once** at the
  payable/line total — never round mid-calculation (prevents accumulated drift across the
  per-sale-line rollups from [ADR-0006](0006-splittable-lots.md)).
- Document the rounding rule centrally so commission, labour, katt→maund, and cess all share it.
- Reconciliation invariant ([ADR-0010](0010-net-worth-definition.md)) must tolerate at most a
  few rupees of rounding noise, or be defined on pre-rounding totals.

## Open follow-ups
- Confirm round-half-up vs banker's rounding with the user if penny-level disputes arise.
