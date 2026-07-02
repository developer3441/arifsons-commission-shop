---
title: "SplitEase v1 — UI: mobile-first, bilingual Urdu/RTL restyle"
triage-label: ready-for-agent
status: ready-for-agent
glossary: docs/glossary.md
adrs: docs/adr/ (0027–0030 primary)
date: 2026-07-03
---

# SplitEase v1 — UI: mobile-first, bilingual Urdu/RTL restyle

> ⚠️ **Generated snapshot — do not hand-edit.** Regenerate with `/to-prd` when the ADRs change.
> Source of truth for **rules** = `docs/adr/`; for **work** = the issue tracker; visual bar = the
> reference screen (ADR-0028). Where this PRD and an ADR disagree, the **ADR wins**.

## Problem Statement

The **Munshi** records a day's trade on a **phone, on the mandi floor** — but the current web app was
built desktop-shaped: narrow centred pages, a cramped link-row for navigation, and **raw ID text
boxes** where the user must type `thekedar-ali-07` to name a contractor mid-trade. It is
English-only and left-to-right, while the Munshi reads **Urdu** more comfortably. Every screen uses
hardcoded inline styles and per-file colour values, so the app looks unfinished and is painful to use
exactly where it is used most. The engine and data are correct; the surface the shop actually touches
is not.

## Solution

Restyle the whole app to the design language decided in the grill session: **mobile-first**, an
**installable PWA**, **bilingual English/Urdu** (switchable, Urdu default, right-to-left, Nastaliq),
a **bottom-tab shell with a center "+"**, a **light high-contrast utilitarian** look, and a
**searchable ContactPicker** that replaces every raw-ID box (search by **name, id, or phone**). The
**Dashboard** is rebuilt first, to a high standard, as the **reference screen** every other screen is
judged against (ADR-0028). No engine or ledger behaviour changes — this is the surface, not the math.

## User Stories

1. As a **Munshi**, I want to use the app one-handed on my phone, so that I can record a trade while standing at the scale.
2. As a **Munshi**, I want the whole interface in **Urdu**, so that I can read and enter data in the language I think in.
3. As an **Owner**, I want to switch the interface to **English** on my laptop, so that I can review the books in the language I prefer.
4. As any user, I want my **language choice remembered**, so that I don't re-set it every time I log in.
5. As an **Urdu user**, I want the layout to read **right-to-left**, so that it feels natural and nothing is mirrored wrong.
6. As an **Urdu user**, I want text in a proper **Nastaliq** script that is legible on my phone, so that I can read labels at a glance.
7. As any user, I want **money and weight amounts always in Western digits (0-9)**, so that a number never changes shape when I switch language and I never misread an amount.
8. As a **Munshi**, I want to pick a **Zamindar / buyer / Thekedar by searching their name, id, or phone**, so that I never type a raw id.
9. As a **Munshi**, I want the contact search to open as a **full-screen sheet** with a big list, so that I can find and tap a contact quickly on a small screen.
10. As an **Owner**, I want to **store a phone number** on each contact, so that contacts are searchable by it and I can reach them.
11. As a **Munshi**, I want a **bottom tab bar** (Dashboard, Ledgers, Contacts, More), so that the main areas are one thumb-tap away.
12. As a **Munshi**, I want a prominent **center "+"** that opens New Trade / Issue Advance / Record Payment, so that my most frequent actions are always reachable.
13. As an **Owner**, I want **setup screens (Users, Configuration, Genesis)** grouped under **More**, so that rare admin actions don't clutter daily navigation.
14. As any user, I want to **install the app to my home screen**, so that it opens like a native app and loads instantly.
15. As a **Munshi**, I want the **Dashboard** to show **Cash in Hand** and **True Shop Value** as two clear pillars, so that I see the two headline numbers immediately.
16. As a **Munshi**, I want the **7 ledgers** shown as consistent **colour-coded** cards, so that I recognise each ledger by its colour everywhere in the app.
17. As an **Owner**, I want the **reconciliation indicator** to clearly show OK vs drift, so that I trust the books at a glance.
18. As any user, I want every data view to show **loading, empty, error, and disabled** states, so that the app never looks broken or frozen.
19. As a **Munshi**, I want balances labelled **"owes you" / "you owe"** with colour, so that I never misread a minus sign as a direction.
20. As any user, I want **high contrast in sunlight**, so that I can read the screen on the open mandi floor.
21. As a **Munshi**, I want forms broken into **thumb-friendly steps** with big tap targets, so that New Trade is comfortable on a phone.
22. As a **Munshi**, I want the **New Trade** flow (register lot → weigh bags → split across buyers) to work well one-handed, so that I can complete a sale at the scale.
23. As an **Owner**, I want every screen to look **consistent with the reference Dashboard**, so that the app feels like one product.
24. As a developer, I want **all UI strings in i18n files (en/ur)**, so that nothing is hardcoded and translation is a data change, not a code change.
25. As a developer, I want a **frontend test harness**, so that language-switch, digit-format, and ContactPicker behaviour can't silently regress.

## Implementation Decisions

- **Delivery boundary** (from `docs/architecture.md`): the **web app screens backed by endpoints**. Every slice ships a real, navigable screen — not just a component in isolation. The reconciliation engine and ledgers are unchanged; this feature is the screen surface.
- **UI foundation (built once, first):** Tailwind + shadcn/ui wired ([ADR-0027](../adr/0027-ui-stack-tailwind-shadcn.md)); design tokens as CSS variables, including the fixed **7-ledger colour mapping** and an Urdu type scale (larger base, taller leading) as a **mode**, not a fork. No inline `style={}` for anything a token/component owns.
- **i18n & direction** ([ADR-0030](../adr/0030-bilingual-urdu-localization.md)): react-i18next with `en`/`ur` message files; per-user persisted language; runtime **LTR⇄RTL** via CSS **logical properties** only. Self-hosted subsetted **Nastaliq** woff2 (`font-display: swap`). **Western digits always**, rendered in a Latin font span inside Urdu text.
- **App shell** ([ADR-0029](../adr/0029-mobile-first-pwa.md)): bottom tab bar (Dashboard · Ledgers · Contacts · More) + center **"+"** quick-actions sheet; Owner-only + long-tail screens under *More*. Installable **PWA** (manifest + cached shell/assets).
- **Reference screen** ([ADR-0028](../adr/0028-visual-truth-reference-screen.md)): the **Dashboard** is rebuilt first to reference-grade quality; it *is* the visual spec for the rest.
- **ContactPicker** (design.md convention): a shared component replacing every raw-id input across New Trade, Issue Advance, Record Payment, Bardana, Genesis. Opens a full-screen search sheet; searches **name, id, or phone**; sets the id internally.
- **Backend change (small):** add a **`phone`** field to the contact (accounts) schema + create/edit API + `ContactRecord`; **widen `GET /contacts?kind&q`** so `q` matches **name OR id OR phone** (currently name-only). This is the one non-frontend slice; it must land before the ContactPicker slice depends on phone search.
- **Contacts screen:** capture/display phone; remain searchable.
- **No behavioural change** to the posting engine, ledgers, bills, settlement, or reconciliation.

## Testing Decisions

- **A good test asserts external behaviour, not implementation** — what the user/consumer observes, not internal structure.
- **New frontend seam (highest sensible point):** **Vitest + React Testing Library (jsdom)** — the first frontend test harness. Assert the *behavioural, regression-prone* bits: switching language flips `dir` and swaps visible strings; money/weight render as **0-9 in both languages**; **ContactPicker** issues the search query and, on select, submits the chosen id; each data view renders **loading/empty/error/disabled**. Do **not** snapshot-test pixels.
- **Existing backend integration seam** (vitest-pool-workers, real workerd + throwaway D1): the **phone field + widened search** — `GET /contacts?kind&q` matches name/id/phone; create/edit round-trips phone. Prior art: `backend/test/integration/*.test.ts`.
- **Visual fidelity is human-reviewed** (ADR-0028): each screen-slice PR attaches a **screenshot** compared against the reference Dashboard + `docs/design.md`. CI cannot see the UI; the screenshot is the gate.

## Out of Scope

- **Offline-first (queue & sync)** — chosen as product direction but **deferred to its own grill + ADR** (collides with ADR-0018/0019/0022). The PWA is **online-required** until then. Named here so it is not silently assumed built.
- **Dark mode** — light-only for v1 (ADR-0029/design.md); deferred, not forgotten.
- **A separate native `mobile/` app** — the mobile-first web app is v1's phone experience.
- **Per-screen Figma frames** — none exist or are promised (ADR-0028).
- **Full professional Urdu translation** — the i18n *plumbing* and initial `ur` strings are in scope; polishing/complete professional translation of every string may iterate afterward. The **mechanism** (no hardcoded strings) is in scope and non-negotiable.
- **Generating the API client from OpenAPI** — the hand-written client stays; unaffected by this restyle.
- **Any change to ledger math, bills, settlement, or reconciliation.**

## Further Notes

- **Slice ordering:** the **UI foundation + reference Dashboard** must land first (tokens, i18n, shell, PWA) — it is the base every other screen builds on and *creates* the reference bar. Then the **backend phone/search** slice, then the **ContactPicker** slice (depends on phone search), then the remaining screens restyled in batches, each judged against the reference.
- **The reference Dashboard slice has no prior screen to match** — it is judged against `docs/design.md` conventions alone, by human review of its PR screenshot; it sets the standard.
- **Landmine (CONTEXT.md):** never build LTR-only or desktop-only; strings come from i18n files; digits stay Western (ADR-0029/0030).
