# ADR-0021 — Ledger write integrity: DB-enforced append-only + idempotent submission

**Status:** accepted · **Date:** 2026-07-02

## Question
The whole model rests on the posting stream being append-only — ledgers are projections of it, and a
correction is a **new** reversing posting, never a rewrite ([ADR-0010](0010-net-worth-definition.md) /
[ADR-0014](0014-persistence-d1-drizzle.md)). But two integrity holes remain: nothing physically
*enforces* append-only, and a retried request on a flaky connection could post the same money twice.

## Decision
**Two-layer clarification, then hard enforcement:**

1. **Two layers — entries vs postings.** A user-facing **entry** (a trade, a payment, an advance)
   stays editable per [ADR-0011](0011-corrections-mutable-with-changelog.md). Underneath, each entry
   fans out into **postings** (the +/− movements across the 7 ledgers). Editing an entry **appends**
   correcting postings plus a change-log row — it **never** erases the original postings. ("Pen, not
   pencil": you write a correcting line, you don't scratch out the old one.)

2. **DB-enforced append-only.** The database physically **forbids `UPDATE`/`DELETE`** on the
   `postings` and `change_log` tables (SQLite triggers that `RAISE(ABORT)`). Not even a buggy query,
   a bad migration, or a bad actor can silently rewrite money history. This does **not** restrict
   editing entries — an edit is still just an append.

3. **Idempotent submission.** Every money-moving submission (trade, cash action, correction) carries
   a **client-generated ID**. The server treats it as an idempotency key: re-submitting the same ID
   is a safe no-op that returns the original result, so a dropped-response retry cannot double-post.

## Consequences
- `postings` and `change_log` are insert-only at the storage layer; the append-only guarantee no
  longer depends on developer discipline.
- Corrections, reversals, and settled-entry edits ([ADR-0011](0011-corrections-mutable-with-changelog.md))
  all work by appending — consistent with the trigger enforcement.
- Clients must generate and send a stable unique ID per action; the trade `id` already present serves
  this purpose. The server persists seen IDs to detect duplicates.
- Point-in-time history is reconstructable from the immutable posting + change-log stream, softening
  the reproducibility risk [ADR-0011](0011-corrections-mutable-with-changelog.md) accepted.

## Open follow-ups
- None.
