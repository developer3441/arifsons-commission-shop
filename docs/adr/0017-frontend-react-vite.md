# ADR-0017 — Frontend: React + Vite on Cloudflare Pages

**Status:** accepted · **Date:** 2026-07-01

## Context
The frontend is one client of a decoupled API ([ADR-0018](0018-monorepo-npm-workspaces.md)) and an
authenticated internal tool (no public SEO surface).

## Decision
**React + Vite** as a single-page app, deployed to **Cloudflare Pages**. It consumes the backend API
over HTTP via a typed client generated from the OpenAPI spec ([ADR-0016](0016-rest-api-openapi.md)).

## Consequences
- Web and mobile are symmetric clients of the same API — no backend logic in the frontend.
- Client-side rendering; auth is handled against the API.
- Deploys trivially to Cloudflare Pages.

## Considered & rejected
- **Next.js** — its strength is a *fused* backend (server components/actions/SSR/SEO). We deliberately
  put the backend on Workers and have no SEO need, so Next's advantages don't apply and its fused
  backend conflicts with the decoupled-API decision.
