# ADR-0024 — Backup & retention

**Status:** accepted · **Date:** 2026-07-02

## Question
This is the shop's entire money history; losing it is catastrophic. Persistence is Cloudflare D1
([ADR-0014](0014-persistence-d1-drizzle.md)), which has built-in "Time Travel" (restore to any point
in roughly the last 30 days). Is that enough?

## Decision
**D1 Time Travel _plus_ a scheduled daily off-database export.**

- Keep D1 **Time Travel** for fast point-in-time recovery within its ~30-day window.
- Additionally run a **daily export** of the database to **Cloudflare R2** (object storage), giving
  durable copies that live **outside D1** and **beyond 30 days**.
- Because the ledger is an append-only posting + change-log stream
  ([ADR-0021](0021-ledger-write-integrity.md)), an export is a complete, self-consistent snapshot of
  history — restorable by replay.

## Consequences
- Two independent recovery paths: in-window (Time Travel) and long-term / off-platform (R2 exports) —
  belt-and-suspenders appropriate for financial data.
- Requires a scheduled job (Cloudflare Cron Trigger) and an R2 bucket with its own retention policy.
- Export cadence is daily for v1; tighten to continuous/streaming only if the recovery-point
  objective demands it.

## Open follow-ups
- Retention duration on R2 (how many daily snapshots to keep) — operational tuning, not a design
  blocker.
