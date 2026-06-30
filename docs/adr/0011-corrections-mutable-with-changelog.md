# ADR-0011 — Corrections via mutable entries with a full change log

**Status:** accepted · **Date:** 2026-06-30

## Question
How does the system handle mis-entered auctions / payments?

## Decision
**Entries are editable/deletable, but every change is recorded in an append-only change log**
(who, when, old → new). Balances are recomputed after an edit.

This is a pragmatic middle ground — easier UX than a strict immutable journal, while still
giving an audit trail for disputes.

## Consequences
- Every mutating action writes a `change_log` row referencing the entity, field-level diff,
  actor, and timestamp. The log itself is **never** editable.
- Balances are **derived** from current entries (recompute or incremental) so an edit can't
  leave a ledger out of sync.
- **Risk accepted:** because historical entries can change, a balance "as of last week" is not
  guaranteed reproducible unless reconstructed from the change log. If audit-grade
  point-in-time reporting is later required, revisit toward an immutable-journal model.
- Sensitive edits (settled invoices, completed payouts) should warn / require confirmation.

## Open follow-ups
- Which entry types are locked from editing once settled (vs. always editable)?
