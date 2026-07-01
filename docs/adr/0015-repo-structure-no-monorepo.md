# ADR-0015 — Repo structure: separate `frontend/` and `backend/`, no monorepo

**Status:** superseded by [ADR-0018](0018-monorepo-npm-workspaces.md) · **Date:** 2026-07-01

## Context
Frontend and backend are decoupled (Workers API consumed by web now, mobile later). We want a simple
layout without monorepo/workspace tooling.

## Decision
**One git repository with two top-level app folders — no workspace monorepo:**

```
backend/    Cloudflare Workers + Hono + Drizzle + D1; hosts the PURE posting engine + Zod schemas
frontend/   React + Vite SPA (ADR-0017)
docs/       blueprint, glossary, adr/, prd/, architecture.md   (repo root)
```

- The **pure posting engine + Zod schemas live in `backend/`** (the engine runs server-side; the
  frontend never computes postings — it calls the API).
- **Cross-app type sharing is via the OpenAPI contract**, not a shared package: the frontend
  **generates a typed client** from the backend's OpenAPI spec ([ADR-0016](0016-rest-api-openapi.md)).
- **Mobile (later)** is a third folder (or its own repo) that likewise consumes the OpenAPI spec.

## Consequences
- No pnpm-workspace / Turborepo tooling to maintain; each app has its own `package.json` + deploy.
- **OpenAPI is the boundary** that replaces a monorepo's shared types — one contract, many clients.
- The trade vs a monorepo: no direct TS import of backend types into the frontend; you regenerate the
  client when the API changes. Acceptable, and it's what makes mobile (possibly non-TS) symmetric.

## Assumption
"Separate folders" = **same repo, two folders**. If you meant separate repositories, supersede this.
