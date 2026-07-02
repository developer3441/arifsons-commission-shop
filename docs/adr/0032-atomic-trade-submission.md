# ADR-0032 — A trade is one self-contained idempotent submission

**Status:** accepted · **Date:** 2026-07-03

## Context

New Trade is currently three server round-trips: `createLot` (returns a **server-assigned sequential
lot number**) → `weighBag` × N (server applies Katt) → `postTrade` (references the lot number). This
is fine online but breaks offline ([ADR-0031](0031-offline-write-queue.md)): you cannot weigh bag #2
until `createLot` has landed, so a signal gap *during* composition stalls the whole flow. The lot
number being server-sequential is the one real ID gap (entries already carry client IDs, ADR-0021).

## Decision

**A trade may be submitted as one self-contained, idempotent payload** carrying the farmer, each
bag's **gross weight**, and the buyer **lines** (splittable per [ADR-0006](0006-splittable-lots.md)).
The server creates the lot, the bag records, and all postings **atomically** in one transaction, and
**assigns the lot number at that point** (or at sync time, for a queued trade).

- **Client shows a display-only preview** of running payable maunds using the simple Katt arithmetic
  (`payableKg = max(0, grossKg − kattKgPerBag)`); the **server recomputes authoritatively** on submit.
  This is a preview, not a second engine — **[ADR-0018](0018-monorepo-npm-workspaces.md) is not
  amended** and there is no shared package. Any preview/authoritative divergence is a display nicety,
  never a source of truth.
- **The incremental lot endpoints (`createLot` / `weighBag`) remain** for an online "weigh-as-you-go"
  UX, but a trade no longer *requires* them — the atomic payload is the offline-capable path and the
  simpler online path (one request instead of 2 + N).
- A queued (offline) trade references a **client-side temporary lot reference**; the real sequential
  lot number appears on sync and replaces it on the provisional bill ([ADR-0031](0031-offline-write-queue.md)).

## Consequences

- New Trade composes entirely offline; the whole trade is one idempotent unit, consistent with the
  one-entry-one-submission model of [ADR-0021](0021-ledger-write-integrity.md).
- `POST /trades` gains an inline-lot contract; the OpenAPI spec ([ADR-0016](0016-rest-api-openapi.md))
  is the source of truth for the new shape.
- Splittable-lot semantics ([ADR-0006](0006-splittable-lots.md)) are unchanged — splitting still lives
  in the buyer lines.
- The tiny Katt preview formula is duplicated client-side as **display-only**; kept minimal and
  documented as a preview to bound drift risk (server stays authoritative).
