# ADR-0014 — Persistence: Cloudflare D1 + Drizzle ORM

**Status:** accepted · **Date:** 2026-07-01

## Context
This is a money/accounting system: it needs ACID transactions and an append-only posting stream
that ledgers project from ([ADR-0010](0010-net-worth-definition.md)). Hosting is Cloudflare.

## Decision
- **Cloudflare D1** (SQLite) as the database, accessed via **Drizzle ORM**.
- The **postings** table is append-only; the 7 ledgers and dashboards are **projections** computed
  from it (never written directly). Writes that span entry + postings run in a **transaction**.
- Money stored as **integer PKR**; weight as a 2dp decimal ([ADR-0009](0009-currency-and-precision.md)).
- Drizzle migrations are the **schema source of truth**.

## Consequences
- ACID transactions cover the multi-row posting writes; SQLite's single-writer model is fine at
  single-shop scale.
- Because the engine is pure and the DB is behind a thin data layer, persistence is **swappable** —
  upgrade path is **Hyperdrive + Postgres (Neon)** if scale ever demands it; no engine changes.
- Schema lives in code (migrations), not a prose doc — see [architecture.md](../architecture.md).

## Considered & rejected (for v1)
- **Durable Objects per shop** — elegant serialized consistency, but more complexity than needed now.
- **External Postgres from day one** — heavier ops; revisit only past D1's limits.
