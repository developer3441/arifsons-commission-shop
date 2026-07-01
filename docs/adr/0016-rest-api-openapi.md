# ADR-0016 — REST API described by OpenAPI

**Status:** accepted · **Date:** 2026-07-01

## Context
The API is consumed by multiple clients (web now, mobile later, possibly non-TypeScript). We need a
contract that any client can consume and generate a typed client from.

## Decision
- **REST over HTTP, described by OpenAPI.** The spec is generated from Hono routes via
  **`@hono/zod-openapi`** — the same **Zod** schemas drive runtime validation *and* the OpenAPI spec.
- Clients (frontend, mobile) **generate typed clients from the spec** (e.g. `openapi-typescript` /
  `orval`). The OpenAPI document is the **published contract** ([ADR-0018](0018-monorepo-npm-workspaces.md)).

## Consequences
- One Zod schema per shape = single source for validation + docs + client types (no drift).
- Cross-language friendly: a future native mobile client can codegen from the same spec.
- The OpenAPI spec is the **endpoint source of truth** (don't hand-maintain an endpoints doc).

## Considered & rejected
- **tRPC / Hono RPC** — superb end-to-end TS DX, but couples all clients to TypeScript; rejected to
  keep mobile client-language-agnostic.
