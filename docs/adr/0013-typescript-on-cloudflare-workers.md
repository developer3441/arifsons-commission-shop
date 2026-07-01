# ADR-0013 — TypeScript everywhere; backend on Cloudflare Workers

**Status:** accepted · **Date:** 2026-07-01

## Context
We need a backend that is reusable by a web app now and a mobile app later, hosted on Cloudflare,
with the pure posting engine ([ADR-0010](0010-net-worth-definition.md)) running server-side.

## Decision
- **TypeScript** across backend, frontend, and the domain core.
- The backend runs on **Cloudflare Workers**, using **Hono** as the HTTP framework.

## Consequences
- One language end-to-end; the pure posting engine and Zod schemas are shared logic, not duplicated.
- Workers is an edge runtime — no arbitrary Node APIs (enable `nodejs_compat` only where needed);
  keep the engine free of platform APIs so it stays portable and unit-testable.
- Hono is tiny and TS-first; routes double as the OpenAPI source ([ADR-0016](0016-rest-api-openapi.md)).
