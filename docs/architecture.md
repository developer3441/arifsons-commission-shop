# <Project> — Architecture

The technical map. **Rules behind the choices live in the ADRs**; this doc shows how the pieces fit
and **where the live truth is** (schema, endpoints, config). Keep it high-level — it changes rarely.
_Fill this in before code lands (README step 5)._

**Delivery boundary:** _TBD — the outermost surface a consumer actually touches: an **HTTP API** for
a service, **exported functions** for a library, **commands** for a CLI, **screens** for an app.
`/to-prd` and `/to-issues` read this line to keep every slice end-to-end; the test seam (often a pure
function) is NOT the boundary._

## Components

_TBD — a small diagram of the pieces and how they talk._

## Where the live truth is (don't duplicate in prose)

| Thing | Source of truth |
| --- | --- |
| DB schema | _TBD — schema files / migrations in code_ |
| API contract | _TBD — e.g. generated OpenAPI spec_ |
| Domain rules | `docs/adr/` |
| Domain logic | _TBD — the pure core module in code_ |

## Boundaries & intent

_TBD — dependency rules (which layer may import which), what stays pure, what is swappable._
