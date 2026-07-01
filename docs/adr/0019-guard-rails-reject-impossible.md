# ADR-0019 — Guard rails: reject physically-impossible operations

**Status:** accepted · **Date:** 2026-07-02

## Question
The engine already rejects some impossible actions (selling more bags than a lot holds; reselling
more stock than the Godown holds — both throw). But other operations can still record something that
cannot physically happen — most importantly a cash-out that exceeds the money in the drawer. What is
the uniform policy when an operation would violate physical reality?

## Decision
**Operations that violate physical reality are rejected, not recorded.** One consistent guard-rail
policy across the engine:

- **Negative cash:** any cash-out — Peshi advance, farmer withdrawal, contractor payout, cess
  remittance — that would drive the **Rokar** balance below zero is **rejected** with a clear error.
  Rokar stays a truthful count of physical cash actually in the drawer (blueprint Khata 1 golden
  rule).
- **Oversell (lot):** selling more bags across a lot's sale lines than the lot holds is **rejected**
  ([ADR-0006](0006-splittable-lots.md)).
- **Over-resale (Godown):** selling more bags / net kg than the Godown holds is **rejected**
  ([ADR-0005](0005-beopari-flow.md)).

The shop never pays cash it does not have, and never sells goods it does not hold. There is no
"warn-but-allow" / overdraft mode in v1.

## Consequences
- Rokar can never go negative; a would-be-negative cash action fails loudly at the API boundary
  before any posting is written.
- Callers must surface these rejections as user-facing validation errors (e.g. "insufficient cash in
  Rokar").
- If the shop ever legitimately pays a farmer from money **outside** the drawer (personal pocket,
  a second bank account), that is modelled as a **cash-in to Rokar first** (recording where the money
  came from), then the payout — never as a negative Rokar. Revisit only if that proves too rigid.
- Applies symmetrically to corrections: a reversing/adjusting entry that would breach a guard rail is
  rejected the same way.

## Open follow-ups
- None.
