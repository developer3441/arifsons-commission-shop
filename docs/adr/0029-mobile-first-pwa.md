# ADR-0029 — Mobile-first web app, installable PWA

**Status:** accepted · **Date:** 2026-07-02

## Context

The v1 web app (React + Vite, ADR-0017) was built as a set of narrow centred desktop-ish pages with
a link-row header and no real shell. But the primary user — the **Munshi** — records trades on a
**phone, on the mandi floor**, not at a desk. The heaviest flow (New Trade: register lot → weigh each
bag → split across buyers) is a phone-in-hand workflow. Desktop-first was the wrong default.

architecture.md reserves a *future separate `mobile/` app* (Expo/RN); a mobile-first **web** app
largely reframes that — the web app itself becomes the phone experience.

## Decision

**The web app is mobile-first and ships as an installable PWA.**

1. **Mobile-first layouts** — single-column, thumb-reachable, big tap targets, stepped forms. Wider
   viewports (tablet/desktop) are a progressive enhancement, not the design target.
2. **App shell:** a **bottom tab bar** (Dashboard · Ledgers · Contacts · More) + a prominent **center
   "+"** opening quick actions (New Trade, Issue Advance, Record Payment). Owner-only and long-tail
   screens live under *More*. (Convention detail lives in `docs/design.md`.)
3. **PWA:** installable (home-screen icon, cached app shell/assets for instant load on low-end phones).

## Consequences

- Every screen is designed for a phone first; the reference screen (ADR-0028) is a phone layout.
- Reduces the need for a separate native `mobile/` app; architecture.md's "future mobile" note is
  reframed, not deleted.
- **Offline-capable queue-and-sync is the intended product direction** (chosen 2026-07-02) but its
  design — client-side engine execution, client-generated IDs, sync/conflict resolution — is
  **deferred to a dedicated ADR** and collides with ADR-0018 (no shared package) / ADR-0019 /
  ADR-0022; until that ADR lands the PWA is **online-required in practice**. The ADR-0021
  idempotency keys keep that retrofit safe.
