# ADR-0025 — Login mechanism: password + signed bearer token

**Status:** accepted · **Date:** 2026-07-02

## Question
ADR-0020 settles the role model (Owner/Bookkeeper/Viewer) but defers the login mechanism itself —
password vs OAuth, session vs token. The backend is a stateless Cloudflare Worker API consumed by a
separately-deployed SPA (and later mobile), so what concretely authenticates a request?

## Decision
**Username + password login, issuing a signed bearer token (HMAC-SHA256) the client sends on every
request.** No sessions table, no OAuth provider — a single trusted shop's staff, kept simple.

- `POST /auth/login` takes `{ username, password }`, verifies against a PBKDF2-SHA256 hash (Web
  Crypto `crypto.subtle`, 100,000 iterations, random 16-byte salt, stored as `salt:hash`), and
  returns a token.
- The token is a compact three-part string — `base64url(header).base64url(payload).base64url(hmac)`
  — signed with a server-side secret (`AUTH_SECRET`, a Worker binding). Payload carries
  `{ sub: userId, role, iat, exp }`; **v1 expiry is 24 hours**.
- Every subsequent request carries `Authorization: Bearer <token>`. The server verifies the HMAC
  and expiry on each request — **stateless**, no server-side session store.
- **Logout** is client-side only: discard the token. Because verification is stateless, a token
  cannot be server-side revoked before it expires — accepted for v1 given the 24h window and
  single trusted shop; revisit toward a session/allow-list if that risk window is too wide.

## Consequences
- No new persistent session state — one `users` table (id, name, username, password_hash, role,
  active) is the only new storage this ADR needs.
- `AUTH_SECRET` must be provisioned as a Worker secret in every environment (dev/test/prod); tests
  use a fixed test secret.
- RBAC (ADR-0020) is enforced by two Hono middlewares: `requireAuth` (valid, unexpired token) and
  `requireOwner` (role === 'owner'), applied per-route.
- Every posting and change-log row stamps `actorUserId` from the verified token (ADR-0020/0011).

## Open follow-ups
- Server-side revocation (deactivating a user takes effect only once their current token expires,
  up to 24h) — revisit if that's too slow for a fired/compromised account.
