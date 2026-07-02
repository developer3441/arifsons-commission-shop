# SplitEase — Architecture

The technical map. **Rules behind these choices live in the ADRs** (`0013`–`0018`); this doc shows how
the pieces fit and **where the live truth is** (schema, endpoints). Keep it high-level — it changes rarely.

## Components

```
┌─────────────┐        OpenAPI-typed client         ┌───────────────────────────┐
│  frontend/  │  ───────── HTTP / REST ───────────▶ │  backend/  (Cloudflare      │
│ React+Vite  │ ◀──────── JSON responses ────────── │  Workers + Hono)            │
│ (CF Pages)  │                                      │   ├─ routes (zod-openapi)   │
└─────────────┘                                      │   ├─ PURE posting engine    │
        ▲                                            │   ├─ Zod schemas            │
        │ (later) same OpenAPI spec                  │   └─ Drizzle ── D1 (SQLite) │
┌─────────────┐                                      └───────────────────────────┘
│  mobile/    │  (future: Expo / RN or native)
└─────────────┘
```

- **ADR-0013** TypeScript on Workers · **ADR-0014** D1 + Drizzle · **ADR-0018** monorepo (workspaces) ·
  **ADR-0016** REST + OpenAPI · **ADR-0017** React + Vite.

**Delivery boundary:** two consumer surfaces — (1) the **HTTP API**, the OpenAPI contract served at `/openapi.json` (browsable at `/docs`), for programmatic clients (the web app, future mobile); and (2) the **web app screens** (see `docs/design.md`), the human-facing surface for shop staff. A user feature is not delivered until it reaches a **screen** backed by an **endpoint**; a programmatic-only capability is delivered when it reaches the API. The pure posting engine is the *test seam*, not the deliverable. (`/to-prd` and `/to-issues` read this line to keep every slice end-to-end.)

## Data flow (one trade)

1. Client POSTs a trade as **one self-contained idempotent submission** carrying the lot + bag weights + buyer lines (ADR-0032) → Hono route validates with **Zod**. Offline, safe writes queue in IndexedDB and replay on reconnect (ADR-0031); the client shows a display-only preview, the server stays authoritative.
2. The **pure posting engine** (`postTradeEntry`) returns `{ postings[], farmerBill, buyerInvoices[] }`.
3. Backend writes the entry + **append-only postings** in one **D1 transaction** (ADR-0014).
4. The 7 ledgers, bills, and dashboards are **projections** read back from the posting stream (ADR-0010).

## Where the live truth is (don't duplicate in prose)

| Thing | Source of truth |
| --- | --- |
| **DB schema** | Drizzle schema + migrations in `backend/` |
| **API endpoints** | the **OpenAPI spec** generated from Hono routes (`@hono/zod-openapi`) — served at `/openapi.json`, browsable at `/docs` (Swagger UI) |
| **Validation / shared shapes** | **Zod** schemas in `backend/` (feed both validation and OpenAPI) |
| **Domain rules** | `docs/adr/` |
| **Domain logic** | the pure posting engine in `backend/` |

## Boundaries & intent

- The **posting engine is pure** (no I/O, no platform APIs) → unit-testable against the reconciliation
  oracle, and **swappable off Cloudflare** if ever needed.
- **OpenAPI is the contract** between backend and every client — we run a workspace monorepo but keep
  **no shared package**, so OpenAPI is what every client binds to (ADR-0018/0016).
- **Persistence is swappable** (D1 → Hyperdrive+Postgres) behind the Drizzle data layer (ADR-0014).

## Repo & backend layout

The concrete shape of the code. The split is mandated by the pure-engine rule ([ADR-0013](adr/0013-typescript-on-cloudflare-workers.md)); the apps are linked as npm workspaces with **no shared package** ([ADR-0018](adr/0018-monorepo-npm-workspaces.md)); this section just makes it concrete.

```
package.json  root workspaces: ["backend", "frontend"] — links the apps, holds no shared code
backend/
  src/
    domain/     PURE engine — no I/O, no framework imports. money, posting, later postTradeEntry.
    db/         Drizzle schema + migrations + repository — the ONLY code that touches D1.
    routes/     Hono + zod-openapi handlers — thin HTTP boundary (validate → engine → db → respond).
    index.ts    Worker entry: build the Hono app, bind D1.
  test/
    domain/       fast pure unit tests (no runtime)
    integration/  route → engine → D1 tests (vitest-pool-workers)
  wrangler.jsonc      Worker + D1 binding
  drizzle.config.ts   migration config
frontend/     React + Vite SPA (ADR-0017); calls the API, computes no postings.
```

**Dependency rule — imports point *inward*:** `routes/` → `db/` → `domain/`. `domain/` imports **nothing** from `db/` or `routes/`. That is what keeps the engine pure, unit-testable, and swappable off Cloudflare. All business logic lives in `domain/`; routes stay thin.
