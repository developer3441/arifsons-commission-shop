# ADR-0026 — Frontend ↔ API access: separate origins, build-time URL, CORS allowlist

**Status:** accepted · **Date:** 2026-07-02

## Context

The SPA (Cloudflare Pages, ADR-0017) and the Worker API deploy **separately** (ADR-0018): different
origins in production. In dev the Vite proxy forwards `/api` → the local Worker, so the frontend
never needed the API's address — which left production unwired: a built SPA had no way to reach the
API at all. The alternative — serving the SPA from the Worker itself (one origin, no CORS) — was
considered and **rejected**: we keep the two apps independently deployable.

## Decision

1. **The SPA learns the API origin at build time** via `VITE_API_URL`, falling back to `/api` so dev
   keeps using the Vite proxy with no configuration:
   `const BASE = import.meta.env.VITE_API_URL ?? '/api'`.
   The value is **public, never a secret** (Vite bakes it into the bundle). It is set per environment
   in the Pages build settings; `frontend/.env.example` documents the variable.
2. **The Worker allows cross-origin calls only from an exact allowlist** — the comma-separated
   `CORS_ORIGINS` var (`wrangler.jsonc` / dashboard), never `*`. Empty/unset = same-origin only,
   which is what tests and the dev proxy see. Allowed headers: `content-type`, `authorization`.
3. **Auth stays a bearer header** (ADR-0025) — no cookies, therefore no credentialed CORS.

## Consequences

- Production needs a **matching pair** set together: `VITE_API_URL` (Pages build env) and
  `CORS_ORIGINS` (Worker var). One without the other = a broken deploy.
- Changing the API URL requires a frontend **rebuild** (build-time, not runtime).
- Dev and tests are untouched: no Origin header → the CORS middleware no-ops.
- Preview deploys must be added to `CORS_ORIGINS` to work against the real API.
