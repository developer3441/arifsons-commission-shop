# ADR-0023 — Business dating & timezone

**Status:** accepted · **Date:** 2026-07-02

## Question
Rokar is framed as a **daily** cash count and settlements happen on set days, but nothing fixes the
day boundary or timezone — so "which day did this entry land on?" is ambiguous. And because history is
imported ([ADR-0022](0022-opening-balances-genesis.md)) and a sale may be recorded the morning after
it happened, entries sometimes need a date that is **not** "now."

## Decision
**Settable business date, fixed business timezone.**

- Every entry carries a **business date** that **defaults to today** but can be **backdated** (e.g. to
  record yesterday's trade, or to date the genesis import).
- The business timezone is fixed to **Pakistan Standard Time (PKT, UTC+5)**. All "daily" boundaries
  (daily Rokar totals, day-grouped reports) use **midnight PKT**.
- Timestamps are **stored in UTC** and **rendered / aggregated by PKT**. Every posting and change-log
  row also keeps the true wall-clock `created_at` (UTC) distinct from the entry's business date.

## Consequences
- Daily Rokar and day-grouped statements land entries on the correct business day regardless of the
  server's clock or the user's device timezone.
- Backdating is a normal capability, not a correction; it does not bypass append-only
  ([ADR-0021](0021-ledger-write-integrity.md)) or guard rails
  ([ADR-0019](0019-guard-rails-reject-impossible.md)).
- Two dates coexist per entry: **business date** (what day the trade belongs to) and **created_at**
  (when it was actually keyed). Reports use business date; the audit trail uses both.
- v1 is single-timezone; a multi-region/multi-shop future would revisit this.

## Open follow-ups
- None.
