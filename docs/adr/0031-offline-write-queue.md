# ADR-0031 — Offline capability: Tier-1 resilient write-queue (safe writes only)

**Status:** accepted · **Date:** 2026-07-03

## Context

The Munshi records trades on a phone on the mandi floor, where signal comes and goes ([ADR-0029](0029-mobile-first-pwa.md)
chose mobile-first and named offline-capable as the intended direction, deferred to this ADR). Two
depths were considered: a **full** offline mode (run the pure engine client-side, compute projections
locally, validate offline) and a **write-queue** tier (capture writes, replay on reconnect). Full
offline would amend [ADR-0018](0018-monorepo-npm-workspaces.md) (share the engine to the client) and
force a sync-conflict/reconciliation design — large and risky for a money app. The groundwork for the
cheap tier already exists: entry IDs are **client-generated idempotency keys** ([ADR-0021](0021-ledger-write-integrity.md)),
so a replayed submission cannot double-post.

Not all writes are equally safe offline. A **trade** cannot surprise-reject — its only guard is
oversell ([ADR-0019](0019-guard-rails-reject-impossible.md)), which the client can check locally from
the lot's bag count; it never touches the Rokar-cash guard. A **cash-out** (Peshi advance, farmer
withdrawal, contractor payout, cess remittance) *can* be rejected on sync because the Rokar ≥ 0 guard
depends on the *current* cash balance, which may have moved while offline — and the cash may already
have been handed over.

## Decision

**Tier-1 resilient write-queue. Safe writes queue offline; cash-outs require a live connection.**

1. **Scope.** **Offline-queueable:** trades, bardana lend/return, and non-cash corrections. **Online-only
   (require live signal):** all cash-outs — advance, withdrawal, payout, cess remit. The queue holds
   only operations that cannot fail a guard in a way that misleads a counterparty.
2. **No client-side engine.** The client shows *display-only* previews (see [ADR-0032](0032-atomic-trade-submission.md));
   the server remains the sole authority that runs the engine and writes postings. **[ADR-0018](0018-monorepo-npm-workspaces.md)
   is NOT amended** — no shared package, no engine in the frontend.
3. **Durable queue.** Pending submissions live in **IndexedDB** (survive app close / refresh / phone
   restart). Idempotency keys ([ADR-0021](0021-ledger-write-integrity.md)) make replay safe.
4. **Two-class failure handling.** **Transient** (offline / 5xx / expired-token 401 — the 24h token of
   [ADR-0025](0025-login-mechanism.md) will 401 a phone left offline overnight) → retry with backoff;
   a 401 prompts re-login then resumes; **never discarded**. **Terminal** (genuine 4xx validation) →
   stop retrying, move the item to a visible **"needs attention"** list to resolve or discard **with a
   reason**. Nothing is ever silently dropped.
5. **Local read-cache.** To compose a trade offline the client caches the **contact list** (for the
   ContactPicker) and **shop config + per-contact overrides** (for the bill preview), refreshed each
   online session. Dashboard balances shown offline are **"as of last sync,"** never used to validate.
6. **Sync.** Auto-flush on reconnect (FIFO) plus a manual "sync now"; a persistent **sync-status
   indicator** (pending count / syncing / all-synced / N failed) is always visible.

## Consequences

- Covers intermittent-signal pain cheaply; no conflict-resolution machinery, no engine-sharing.
- Cash-outs are unavailable with no signal — an accepted safety trade-off (they are rarer and the one
  place a stale balance could hand out money the drawer lacks).
- Multi-device stays safe by construction: offline writes are independent idempotent entries; a
  correction is an **append** ([ADR-0021](0021-ledger-write-integrity.md)), so two devices never lose
  an update.
- **Full offline (client-side engine, local projections, live validation) remains a possible future
  Tier-2** — it would supersede parts of this ADR and amend ADR-0018; not built now.
