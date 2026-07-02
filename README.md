# SplitEase — Agri-Mandi Commission Shop Ledger

Bookkeeping for an **Arhat (commission shop) & Beopari (trading)** business on a grain mandi:
one trade entry fans out across **7 ledgers**, tracking *Cash in Hand* and *True Shop Value*.

**Stack:** TypeScript everywhere · Hono on Cloudflare Workers · D1 (SQLite) + Drizzle · React + Vite
on Cloudflare Pages · npm workspaces monorepo. Decisions behind these choices: [`docs/adr/`](docs/adr/README.md).

## Layout

| Path | What |
| --- | --- |
| `backend/` | Worker API — pure posting engine (`src/domain/`), Drizzle/D1 (`src/db/`), Hono routes (`src/routes/`) |
| `frontend/` | React + Vite SPA — calls the API, computes no postings |
| `docs/` | The docs system — [architecture](docs/architecture.md) · [ADRs](docs/adr/README.md) · [glossary](docs/glossary.md) · [blueprint](docs/blueprint.md) · [design](docs/design.md) |
| `CLAUDE.md` | Agent front door — points to everything above |

## Run

```bash
npm ci

# backend secrets for local dev (gitignored):
cp backend/.dev.vars.example backend/.dev.vars

npm run dev:backend      # wrangler dev — ⚠️ uses the REMOTE D1 (real data)
npm run dev:frontend     # vite dev server
```

The API serves its OpenAPI contract at `/openapi.json` (browsable at `/docs`).

## Test & checks

```bash
npm test                 # backend suite — real Workers runtime, throwaway local D1 (never remote)
npm run typecheck
npm run docs:lint        # mechanical docs-system consistency checks
```

CI runs all three on every PR. **`main` is protected** — changes merge via PR with green CI only.

## Deploy

```bash
npm run db:migrate       # apply migrations to remote D1
npm run deploy:backend   # wrangler deploy
npm run build:frontend   # static build for Cloudflare Pages
```

Production secrets are set with `wrangler secret put AUTH_SECRET` — never committed.
