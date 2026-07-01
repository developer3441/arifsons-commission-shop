# ADR-0008 — Peshi advances are interest-free

**Status:** accepted · **Date:** 2026-06-30 · **Clarified:** 2026-07-02 (ratify order-independent settlement cascade)

## Question
Do pre-season cash advances (Peshi) accrue interest?

## Decision
**Interest-free.** The shop's return is the exclusivity obligation plus commission on the
eventual harvest — not interest on the advance.

## Consequences
- An advance simply posts a debit to the farmer ledger (− balance) and cash out of Rokar.
  No accrual engine, no interest schedule.
- At harvest, the auto-deduction cascade (§6) repays the advance from crop proceeds at face
  value — see settlement flow.
- Keeps the farmer ledger simple: balance = principal advanced − repaid ± crop nets.
- **Settlement cascade is order-independent.** A farmer balance is the sum of the whole
  posting stream ([ADR-0010](0010-net-worth-definition.md)), so new crop proceeds automatically
  net against any outstanding Peshi / bag debt regardless of posting order. The farmer
  **statement breakdown** *presents* it as debt-repaid-first, then held surplus; if proceeds
  are less than the debt, the remaining debt persists as a negative balance. This is a
  reporting breakdown, not a special posting order.

## Open follow-ups
- If a future market requires interest, revisit toward ADR-0008's "optional markup" variant.
