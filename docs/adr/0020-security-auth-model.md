# ADR-0020 — Security & auth: single-shop, multi-user, role-based

**Status:** accepted · **Date:** 2026-07-02

## Question
The delivery boundary is an internet-facing HTTP API ([ADR-0016](0016-rest-api-openapi.md)) that a
future mobile client will call, and the change log ([ADR-0011](0011-corrections-mutable-with-changelog.md))
records **who** made each change — but no identity or authorization model exists. Who logs in, and
what may they do?

## Decision
**One shop, multiple named users, role-based access control (RBAC).** Not multi-tenant — a single
shop's staff. Three roles:

| Role | Can do |
| --- | --- |
| **Owner** (Arhtiya) | Everything: all Bookkeeper actions **plus** sensitive ones — change commission/Katt/cess config, remit cess, edit **settled** entries, manage users. |
| **Bookkeeper** (Munshi) | Day-to-day entry: register lots, weighing, record trades, issue advances, record buyer payments / farmer withdrawals / contractor payouts. **Cannot** change config, remit cess, edit settled entries, or manage users. |
| **Viewer** | Read-only: view ledgers, statements, and the dashboard. Posts nothing. |

Only **shop staff** are users. Farmers, buyers, and contractors are **accounts/customers**, never
logins.

- Every posting and every change-log row **stamps the authenticated user** as actor, giving the
  audit trail a real "who" ([ADR-0011](0011-corrections-mutable-with-changelog.md)).
- Every API endpoint requires authentication; sensitive endpoints additionally require the **Owner**
  role.

The login **mechanism** (password vs OAuth, token format, session lifetime) is an implementation
detail deferred to a technical follow-up; it does not change this role model.

## Consequences
- The data model gains a `user` entity (id, name, role) and every entry/change-log row carries
  `actor_user_id`.
- The API layer enforces authn on all routes and an Owner-only check on the sensitive set (config,
  cess remittance, settled-entry edits, user management).
- RBAC is coarse (three fixed roles), which is right-sized for one trusted shop; a finer permission
  matrix is explicitly **out of scope** for v1.
- Couples to [ADR-0011](0011-corrections-mutable-with-changelog.md) (actor identity) and
  [ADR-0019](0019-guard-rails-reject-impossible.md) (sensitive money-out is Owner-gated).

## Open follow-ups
- Login mechanism / token strategy (technical ADR).
