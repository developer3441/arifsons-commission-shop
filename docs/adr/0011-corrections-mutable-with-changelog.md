# ADR-0011 — Corrections via mutable entries with a full change log

**Status:** accepted · **Date:** 2026-06-30 · **Clarified:** 2026-07-02 (settled-entry behaviour, actor identity, and append-only enforcement resolved)

## Question
How does the system handle mis-entered auctions / payments?

## Decision
**Entries are editable/deletable, but every change is recorded in an append-only change log**
(who, when, old → new). Balances are recomputed after an edit.

This is a pragmatic middle ground — easier UX than a strict immutable journal, while still
giving an audit trail for disputes.

## Consequences
- Every mutating action writes a `change_log` row referencing the entity, field-level diff,
  **actor** (the authenticated user — [ADR-0020](0020-security-auth-model.md)), and timestamp. The
  log itself is **never** editable.
- Balances are **derived** from current entries (recompute or incremental) so an edit can't
  leave a ledger out of sync.
- **Edits are appends, not rewrites:** an entry stays editable, but editing it **appends** correcting
  postings + a change-log row — it never erases the original postings, which are physically
  insert-only at the database ([ADR-0021](0021-ledger-write-integrity.md)). This makes the
  point-in-time history fully reconstructable from the immutable stream, softening the reproducibility
  risk below.
- **Settled entries — RESOLVED (warn, don't lock):** an entry whose money has already settled
  downstream (cess remitted, contractor paid, buyer cleared) is **not** locked — editing it is
  allowed after a **warning**, and the change log records who/when/old→new like any edit. Editing a
  settled entry is an **Owner**-only action ([ADR-0020](0020-security-auth-model.md)), and any
  resulting cash movement is still subject to the guard rails
  ([ADR-0019](0019-guard-rails-reject-impossible.md)).

## Open follow-ups
- None — settled-entry behaviour (warn, keep changelog) is settled above.
