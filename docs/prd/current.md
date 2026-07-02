---
title: "SplitEase v1 — UI restyle + Offline (reference overview)"
status: reference-snapshot
date: 2026-07-03
---

# SplitEase v1 — Mobile Bilingual UI + Offline (reference overview)

> ⚠️ **Point-in-time reference, not a source of truth and not auto-maintained.** The SSOT is the
> **ADRs** (rules, `docs/adr/`) and the **issues** (work, #52–#61). If this doc and they disagree,
> **they win.** This overview documents work already decided and sliced; it exists for human
> orientation, not to drive `/to-issues` (that has already run). Vocabulary follows
> [`docs/glossary.md`](../glossary.md).

## Problem Statement

The **Munshi** runs a grain **Mandi** on a **phone, on the floor**, where signal comes and goes — but
the v1 app was built desktop-shaped, **English-only**, left-to-right, with **raw-ID text boxes** for
naming a **Zamindar**/buyer/**Thekedar**, hardcoded inline styles, and no offline capability. The
calculation engine and the 7 ledgers are correct; the surface the shop actually touches is unusable
where it is used most, and it stops working the moment the connection drops.

## Solution

Two coordinated initiatives, both over the existing correct engine:

1. **A mobile-first, bilingual (English/Urdu, RTL) restyle** — an installable PWA with a bottom-tab
   shell, a searchable **ContactPicker** replacing every raw-ID box, a light high-contrast look, and
   a reference-grade **Dashboard** that sets the visual bar for every screen.
2. **Tier-1 offline capability** — **safe writes** (trades, bardana, non-cash corrections) are
   captured on a durable queue and sync when signal returns; **cash-outs stay online**; nothing is
   ever silently lost.

## User Stories

1. As a **Munshi**, I want to use the app one-handed on my phone, so that I can work at the scale.
2. As a **Munshi**, I want the whole interface in **Urdu**, so that I read and enter data in my language.
3. As an **Owner**, I want to switch to **English** on my laptop, so that I review the books in mine.
4. As any user, I want my **language choice remembered**, so that I don't reset it each login.
5. As an **Urdu user**, I want the layout **right-to-left** in a legible **Nastaliq** script.
6. As any user, I want money/weights in **Western digits (0-9)** in both languages, so that a number never changes shape and I never misread it.
7. As a **Munshi**, I want to pick a contact by searching **name, id, or phone**, so that I never type a raw id.
8. As an **Owner**, I want a **phone number** on each contact, searchable and reachable.
9. As a **Munshi**, I want a **bottom tab bar** + center **"+"**, so that main areas and my frequent actions are one thumb-tap away.
10. As any user, I want to **install the app** to my home screen, so that it opens like a native app.
11. As a **Munshi**, I want the **Dashboard** to show **Cash in Hand** and **True Shop Value** clearly, with the **7 ledgers** as colour-coded cards and a **reconciliation** indicator.
12. As any user, I want every data view to show **loading/empty/error/disabled** states.
13. As a **Munshi**, I want balances labelled **"owes you"/"you owe"** with colour, never a bare sign.
14. As a **Munshi**, I want the **New Trade** flow (farmer → weigh bags → split across buyers) to work one-handed and submit in **one step**.
15. As a **Munshi**, I want to **record a trade with no signal**, so that a connection drop doesn't stop me.
16. As a **Munshi**, I want a queued trade's **bill line items** shown exactly offline, with the advance-settlement/net marked **"as of last sync"**.
17. As a **Munshi**, I want a **"pending sync"** badge and a **sync-status** indicator, so that I always know what has and hasn't reached the server.
18. As a **Munshi**, I want **bardana** lending to work offline too.
19. As an **Owner**, I want **cash-outs (advance/withdrawal/payout/cess remit) to require a connection**, so that the drawer is never trusted against a stale balance.
20. As any user, I want a queued write that **fails** to surface in a **"needs attention"** list, so that nothing is ever silently lost.
21. As any user offline overnight, I want an **expired login** to prompt **re-login and then resume** the queue, not drop my work.
22. As an **Owner**, I want every screen **consistent with the reference Dashboard**, so that the app feels like one product.
23. As a developer, I want **all UI strings in i18n files** and a **frontend test harness**, so that language/format/queue behaviour can't silently regress.

## Implementation Decisions

- **Delivery boundary** (`docs/architecture.md`): the **web app screens backed by endpoints**. Every slice ships a navigable screen.
- **UI stack:** Tailwind + shadcn/ui, tokens as CSS variables incl. the 7-ledger colour map ([ADR-0027](../adr/0027-ui-stack-tailwind-shadcn.md)).
- **Visual truth:** design.md conventions + the **reference Dashboard** ([ADR-0028](../adr/0028-visual-truth-reference-screen.md)); no per-screen Figma.
- **Platform:** mobile-first, installable PWA, bottom-tabs + center "+" shell ([ADR-0029](../adr/0029-mobile-first-pwa.md)).
- **Localization:** bilingual EN/UR, switchable, Urdu default, react-i18next, runtime RTL via logical properties, self-hosted Nastaliq, Western digits always ([ADR-0030](../adr/0030-bilingual-urdu-localization.md)).
- **ContactPicker:** shared full-screen search over name/id/phone; **contacts gain a `phone` field** and the search widens to match it (the one backend change in the UI epic).
- **Atomic trade submission:** a trade is one self-contained idempotent `POST /trades` carrying lot+bags+lines; server creates atomically and assigns the lot number; client shows a display-only payable-maund preview ([ADR-0032](../adr/0032-atomic-trade-submission.md)). No engine shared — [ADR-0018](../adr/0018-monorepo-npm-workspaces.md) intact.
- **Offline Tier-1:** durable IndexedDB write-queue for safe writes; local read-cache of contacts+config; optimistic pending UI + provisional bill; auto-sync on reconnect; **cash-outs online-only**; two-class failure handling (transient retry incl. 401 re-login vs terminal → needs-attention) ([ADR-0031](../adr/0031-offline-write-queue.md)). Idempotency keys ([ADR-0021](../adr/0021-ledger-write-integrity.md)) make replay safe.

## Testing Decisions

- **A good test asserts external behaviour, not implementation.**
- **New frontend seam:** Vitest + React Testing Library (jsdom) — the first frontend harness. Covers language-switch (dir+strings), Western-digit formatting, ContactPicker wiring, required states, and offline queue/replay/idempotency, cash-out-blocked-offline, pending badges, failure→needs-attention.
- **Existing backend integration seam** (vitest-pool-workers): the contact `phone` field + widened search, and the atomic `POST /trades` contract (oversell still rejected). Prior art: `backend/test/integration/*.test.ts`.
- **Visual fidelity is human-reviewed** ([ADR-0028](../adr/0028-visual-truth-reference-screen.md)): each screen-slice PR attaches a screenshot judged against the reference Dashboard.

## Out of Scope

- **Full-offline Tier-2** (client-side engine, local projections, live validation) — deferred; would amend ADR-0018; not grilled.
- **Dark mode** — light-only for v1.
- **A separate native `mobile/` app** — the mobile-first web app is v1's phone experience.
- **Per-screen Figma frames** — none exist or are promised.
- **Complete professional Urdu translation** — the i18n *mechanism* + initial strings are in scope; full translation may iterate.
- **Any change to ledger math, settlement, or reconciliation.**

## Further Notes

Current backlog (dependency-ordered; these issues, not this doc, are the work SSOT):

- **#52** Foundation + reference Dashboard *(only unblocked slice)*
- **#53** Contacts gain a phone number, searchable → blocked by #52
- **#54** New Trade: ContactPicker + atomic single-submission → blocked by #53
- **#55** Action screens adopt ContactPicker → blocked by #54
- **#56** Ledgers & statements restyle → blocked by #52
- **#57** Remaining screens restyle → blocked by #52
- **#60** Offline write-queue + optimistic sync → blocked by #52, #53, #54
- **#61** Offline sync failure handling → blocked by #60
