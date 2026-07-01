# ADR-0018 — Monorepo via npm workspaces (no shared packages)

**Status:** accepted · **Date:** 2026-07-01 · **Supersedes:** [ADR-0015](0015-repo-structure-no-monorepo.md)

## Context
[ADR-0015](0015-repo-structure-no-monorepo.md) chose two independent folders with no workspace
tooling. We want the conveniences of a single workspace — one install, root-level scripts, atomic
commits across apps — **without** giving up the decoupling ADR-0015 valued. The apps stay separate;
we are **not** introducing shared code.

## Decision
**One git repository managed as an npm workspaces monorepo:**

```
package.json     root: { "private": true, "workspaces": ["backend", "frontend"] }
backend/         Cloudflare Workers + Hono + Drizzle + D1 — its own package.json
frontend/        React + Vite SPA — its own package.json
docs/            blueprint, glossary, adr/, prd/, architecture.md
```

- **No shared packages.** `backend/` and `frontend/` keep their own dependencies, types, `tsconfig`,
  build, and deploy. Neither imports the other. Each stays exactly as independent as before.
- **The API boundary is unchanged:** the frontend talks to the backend over HTTP; the OpenAPI spec
  remains the contract ([ADR-0016](0016-rest-api-openapi.md)). Mobile (later) is another workspace or
  its own repo, likewise over OpenAPI.
- **Workspaces provide only:** one hoisted `npm install`, one lockfile, and root scripts that delegate
  into a workspace (`npm run test -w backend`).

## Consequences
- One install and one `node_modules`; either app runs from the repo root.
- Atomic commits / PRs spanning both apps.
- The door is open (not walked through): if we later want to share TS code, add a `packages/*` and opt
  an app in — workspaces already support it. This ADR deliberately ships **zero** shared packages.
- Trade vs ADR-0015: a root `package.json` plus workspace hoisting to maintain — minimal at this scale.
