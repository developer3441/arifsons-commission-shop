# Architecture Decision Records — index

The catalog of decisions. **Conventions & status lifecycle:** see
[ADR-0000](0000-record-architecture-decisions.md).

> Status: `accepted` = in force · `superseded` = replaced, kept for history · `proposed` = draft

| ADR | Title | Type | Status |
| --- | --- | --- | --- |
| 0000 | Record architecture decisions (conventions) | meta | accepted |
| 0001 | Bardana & labour cost bearer is configurable per deal | business | accepted |
| 0002 | Canonical weight model: gross kg per bag → payable maunds | business | accepted |
| 0003 | Katt = fixed kg-per-bag deduction | business | accepted |
| 0004 | Cess → government liability pool (**7th ledger**) | business | accepted |
| 0005 | Beopari (own-trading) = shop as internal buyer | business | accepted |
| 0006 | Lots are splittable across multiple buyers | business | accepted |
| 0007 | Thekedar: many contractor accounts | business | accepted |
| 0008 | Peshi advances are interest-free | business | accepted |
| 0009 | PKR, whole rupees, weight to 0.01 kg | business | accepted |
| 0010 | True Shop Value = full balance sheet (assets − liabilities) | business | accepted |
| 0011 | Corrections = mutable entries + change log | business | accepted |
| 0012 | Commission charged on both sides, configurable | business | accepted |
| 0013 | TypeScript everywhere; backend on Cloudflare Workers | technical | accepted |
| 0014 | Persistence: Cloudflare D1 + Drizzle ORM | technical | accepted |
| 0015 | Repo structure: separate frontend/ + backend/, no monorepo | technical | superseded by 0018 |
| 0016 | REST API described by OpenAPI | technical | accepted |
| 0017 | Frontend: React + Vite on Cloudflare Pages | technical | accepted |
| 0018 | Monorepo via npm workspaces (no shared packages) | technical | accepted |

**Open / planned:** finance NFR ADRs — data integrity, backup/retention, and a security/auth model —
still to be decided.

> **Testing is skill-driven, not an ADR** — run the `tdd` skill manually (`/tdd`, red→green→refactor). The technical map lives in [`docs/architecture.md`](../architecture.md).

> **Note:** ADR-0004 makes the system **7 ledgers, not 6**. Any "6-ledger" copy is stale.
