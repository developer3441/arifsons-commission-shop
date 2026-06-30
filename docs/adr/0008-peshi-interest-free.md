# ADR-0008 — Peshi advances are interest-free

**Status:** accepted · **Date:** 2026-06-30

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

## Open follow-ups
- If a future market requires interest, revisit toward ADR-0008's "optional markup" variant.
