---
title: "SplitEase v1 — Mandi Ledger: API & App"
triage-label: ready-for-agent
status: ready-for-agent
glossary: docs/glossary.md
adrs: docs/adr/  (0001–0024)
date: 2026-07-02
---

# SplitEase v1 — Mandi Ledger: API & App

> ⚠️ **Generated snapshot — do not hand-edit.** Regenerate with `/to-prd` when the ADRs change.
> Source of truth for **rules** = `docs/adr/`; for **work** = the issue tracker; visual truth = the
> Figma file via `docs/design.md`. This PRD is the disposable bridge. Vocabulary follows
> [`docs/glossary.md`](../glossary.md). Where this PRD and an ADR disagree, the **ADR wins**.

## Problem Statement

An **Arhtiya** (commission-shop owner) runs a grain **Mandi** and keeps everyone's money in paper
registers. The cash in the drawer is not profit — it is a mix of **Zamindar** (farmer) payouts owed,
**Thekedar** (labour) wages held, and government **Cess** collected for the market committee. Real
value also sits *outside* the drawer as interest-free **Peshi** advances and **Bardana** (bags) lent
to farmers. The shopkeeper cannot reliably answer two questions: *"How much physical cash can I pay
out right now?"* and *"Is the business worth more than the capital I started with?"* One mis-entered
auction or a forgotten advance silently corrupts every downstream balance, and money disputes have no
audit trail.

There is already a correct, fully-tested calculation **engine** for all of this — but no way to
actually *use* it: no screens, no saved data, no logins, no way to record a real day's trade and see
the books. The engine is a brain with no body.

## Solution

A web application (and a future mobile client) where shop staff record **one trade entry** on the
Mandi floor and it fans out — automatically and consistently — across the **seven ledgers** (*Rokar*,
*Zamindar*, *Pakka*, *Thekedar*, *Godown/Mal*, *Amdani/Kharch*, *Government/Cess*). From one entry it
derives the farmer's **Kacha** bill and each buyer's **Pakka** invoice, posts every commission /
labour / bag / cess / advance consequence to the correct ledger, and always shows two separate
headline numbers on the dashboard:

- **Cash in Hand** — physical cash in the *Rokar* ledger.
- **True Shop Value** — the full balance sheet ([ADR-0010](../adr/0010-net-worth-definition.md)).

The app is **multi-user with roles** ([ADR-0020](../adr/0020-security-auth-model.md)), every change is
**audited** ([ADR-0011](../adr/0011-corrections-mutable-with-changelog.md)), the money history is
**tamper-evident and backed up** ([ADR-0021](../adr/0021-ledger-write-integrity.md) /
[ADR-0024](../adr/0024-backup-and-retention.md)), and an existing shop can be **onboarded mid-cycle**
with its real opening balances ([ADR-0022](../adr/0022-opening-balances-genesis.md)).

This PRD is the layer that gives the engine a body: it **exposes the whole posting engine over an
HTTP API**, **persists** it, wraps it in the new financial NFRs (auth, integrity, dating, backup),
and drives it from the **app screens** in [`docs/design.md`](../design.md). Both business models run
under one roof: pure commission (**Arhat**) and proprietary trading (**Beopari**), the latter modelled
as the shop buying through the same auction as an internal "house" buyer
([ADR-0005](../adr/0005-beopari-flow.md)).

## User Stories

**Accounts & sessions (auth / RBAC — [ADR-0020](../adr/0020-security-auth-model.md))**
1. As an Arhtiya (Owner), I want to log in with my own account, so that every action I take is attributed to me.
2. As an Owner, I want to create logins for my Munshi (Bookkeeper) and a read-only Viewer, so that staff use the system under their own identity.
3. As an Owner, I want sensitive actions (changing rates, remitting cess, editing settled entries, managing users) restricted to me, so that day-to-day staff cannot alter money-critical settings.
4. As a Bookkeeper, I want to do all daily data entry (lots, weighing, trades, advances, payments), so that I can run the floor without owner sign-off on every action.
5. As a Viewer (e.g. an accountant or family member), I want read-only access to ledgers and the dashboard, so that I can review the books without being able to change them.
6. As any user, I want the app to require login before anything loads, so that the shop's money data is never exposed unauthenticated.
7. As an Owner, I want every posting and every edit to record *who* did it, so that the audit trail names a real person in a dispute.

**Onboarding & opening balances ([ADR-0022](../adr/0022-opening-balances-genesis.md))**
8. As an Owner adopting the system mid-season, I want to enter my opening cash, existing farmer/buyer/contractor balances, bags already lent out, and stock on hand, so that the books start from my real position, not zero.
9. As an Owner, I want opening balances recorded as a single dated genesis entry, so that the very first reconciliation balances with no manual fudge.
10. As an Owner, I want to correct a genesis mistake with an adjusting entry, so that I never have to rewrite the opening record.

**Configuration**
11. As an Arhtiya, I want to set a global default commission rate, so that most sales price themselves without per-deal entry.
12. As an Arhtiya, I want separate farmer-side and buyer-side commission rates ([ADR-0012](../adr/0012-commission-both-sides.md)), so that I can run kacha and pakka arhat in one shop.
13. As an Arhtiya, I want to override commission per customer, so that legacy farmers get negotiated rates and high-risk clients pay premium.
14. As an Arhtiya, I want to set a default **Katt** (fixed kg/bag), labour rate per bag, and empty-bag value ([ADR-0003](../adr/0003-katt-mechanics.md)), so that deductions compute automatically.
15. As an Arhtiya, I want a default cost-bearer for bag/labour with per-deal override ([ADR-0001](../adr/0001-bardana-and-labor-cost-bearer.md)), so that I can pass those costs to the buyer when the market expects it.
16. As an Arhtiya, I want to set the cess rate ([ADR-0004](../adr/0004-cess-government-liability-pool.md)) as a flat percentage, so that the Pakka invoice adds it automatically.

**Contacts (customers)**
17. As an Arhtiya, I want to create a *Zamindar* (farmer) account, so that I can track that grower's advances, bags, and payouts.
18. As an Arhtiya, I want to create a *Pakka* (buyer/mill) account, so that I can extend and track credit on auctions they win.
19. As an Arhtiya, I want multiple *Thekedar* (contractor) accounts ([ADR-0007](../adr/0007-multiple-thekedars.md)), so that I can route and settle labour with each crew separately.
20. As an Arhtiya, I want per-customer commission and cost-bearer overrides on a contact, so that their deals price correctly by default.
21. As an Arhtiya, I want to search my contacts and open any one's ledger, so that I can find a grower or mill quickly on a busy floor.
22. As an Arhtiya, I want to read any customer's running balance with a plain-language label ("owes you" / "you owe"), so that I always know our standing without decoding a sign.

**Pre-season banking (Peshi & Bardana)**
23. As an Arhtiya, I want to issue a cash **Peshi** advance to a farmer, so that I fund their season and secure their harvest.
24. As an Arhtiya, I want advances to be interest-free ([ADR-0008](../adr/0008-peshi-interest-free.md)), so that the books match the real verbal contract.
25. As an Arhtiya, I want issuing an advance to reduce *Rokar* cash and debit the farmer in one action, so that both sides stay consistent.
26. As an Arhtiya, I want to lend empty **Bardana** bags to a farmer and track them as an asset in the field, so that True Shop Value stays accurate and I know who holds my bags.
27. As an Arhtiya, I want to record bags returned, so that the outstanding bardana asset reduces correctly.

**Lot lifecycle & weighing**
28. As an Arhtiya, I want to register an arriving **Lot** with a sequential number against a farmer, so that I can track it through its lifecycle.
29. As a Munshi, I want to record each bag's **gross kg** at weighing ([ADR-0002](../adr/0002-weight-model.md)), so that variable-weight bags price correctly.
30. As a Munshi, I want the system to derive **payable maunds** from gross kg minus Katt, so that I price on payable weight, not water weight.
31. As a Munshi, I want a light/wet bag whose payable weight would go negative to clamp at zero (with a warning) but still incur its per-bag labour/bag charges ([ADR-0003](../adr/0003-katt-mechanics.md)), so that the math stays sane without dropping real costs.

**Single-entry trade & invoices**
32. As a Munshi, I want to save one completed trade entry and get both the **Kacha** bill and each **Pakka** invoice, so that I never double-key figures.
33. As an Arhtiya, I want to record an auction as one or more **sale lines** ([ADR-0006](../adr/0006-splittable-lots.md)), each with a buyer, a bag subset, and a rate per maund, so that I can split a lot across buyers.
34. As an Arhtiya, I want the farmer's bill to show gross minus farmer-side commission, farmer-borne labour/bag costs, and advance deductions, so that the farmer sees an itemised settlement.
35. As an Arhtiya, I want the buyer's invoice to show gross plus cess, plus buyer-side commission and any buyer-borne labour/bag costs, so that the buyer sees exactly what they owe.
36. As an Arhtiya, I want commission/labour/bag/cess computed per sale line then rolled up, so that split sales total correctly ([ADR-0006](../adr/0006-splittable-lots.md)).
37. As an Arhtiya, I want a saved trade to post automatically to every affected ledger, so that the books reconcile without manual journal entries.
38. As an Arhtiya, I want the system to refuse selling more bags than the lot holds ([ADR-0019](../adr/0019-guard-rails-reject-impossible.md)), so that I can't oversell a lot by mistake.
39. As an Arhtiya, I want to route each lot's labour to a chosen contractor ([ADR-0007](../adr/0007-multiple-thekedars.md)), so that the right crew is credited.
40. As an Arhtiya, I want to sell a lot to myself as the **house buyer** ([ADR-0005](../adr/0005-beopari-flow.md)), so that I can stock grain for off-season trading through the normal flow.

**Automated settlement cascade**
41. As an Arhtiya, I want crop proceeds to first repay any outstanding Peshi/bag debt automatically ([ADR-0008](../adr/0008-peshi-interest-free.md)), so that old loans clear before payout.
42. As an Arhtiya, I want surplus proceeds to become a positive farmer balance they can withdraw later, so that I can safely hold their money.
43. As an Arhtiya, I want the farmer's statement to show how proceeds were applied (debt repaid, then held surplus), so that the settlement is transparent.
44. As an Arhtiya, I want winning purchases to debit the buyer's *Pakka* account, so that credit owed is tracked until paid.
45. As an Arhtiya, I want cess collected to accumulate in the Government/Cess liability ledger ([ADR-0004](../adr/0004-cess-government-liability-pool.md)), so that I never confuse it with profit.
46. As an Arhtiya, I want only commission (both sides) to land in *Amdani* revenue, so that profit reflects pure earnings and never cess.

**Cash movements (settle-up) — [ADR-0019](../adr/0019-guard-rails-reject-impossible.md)**
47. As an Arhtiya, I want to record a buyer clearing their tab, so that *Rokar* rises and their *Pakka* balance hits zero.
48. As an Arhtiya, I want to pay a contractor their accumulated wages, so that *Rokar* falls and that *Thekedar* balance hits zero.
49. As an Arhtiya, I want to pay a farmer a full or partial withdrawal, so that *Rokar* falls and their balance reduces by what they took.
50. As an Arhtiya, I want to remit collected cess to the market committee, so that *Rokar* falls and the Cess liability hits zero.
51. As an Arhtiya, I want any cash-out that exceeds the drawer to be rejected ([ADR-0019](../adr/0019-guard-rails-reject-impossible.md)), so that Rokar can never show cash I don't physically have.
52. As an Arhtiya, I want *Rokar* touched only when physical cash/bank actually moves, so that cash tracking stays literal.

**Proprietary trading (Beopari / Godown) — [ADR-0005](../adr/0005-beopari-flow.md)**
53. As an Arhtiya, I want a house-buyer purchase to move grain into *Godown* at cost = farmer's net + labour, so that inventory carries a correct, net-worth-neutral cost basis.
54. As an Arhtiya, I want *Godown* to track bag count, net weight, and running average cost per kg, so that I know my stocked position.
55. As an Arhtiya, I want to later sell stored stock to a real buyer, realising trading profit (proceeds − average cost) separate from commission income, so that I see trading margin distinctly.
56. As an Arhtiya, I want the system to refuse selling more stock than the Godown holds ([ADR-0019](../adr/0019-guard-rails-reject-impossible.md)), so that inventory never goes negative.

**Dashboard & reporting**
57. As an Arhtiya, I want **Cash in Hand** and **True Shop Value** shown as two separate pillars, so that I never mistake held money for profit.
58. As an Arhtiya, I want True Shop Value to include bags-lent-out and unrepaid advances as assets and cess-held as a liability ([ADR-0010](../adr/0010-net-worth-definition.md)), so that it reconciles with no manual fudge.
59. As an Arhtiya, I want a profit-based figure (seed capital + retained profit) shown as a reconciliation check, so that a mismatch warns me of a bookkeeping error.
60. As an Arhtiya, I want to view each of the seven ledgers and drill into the entries behind a balance, so that I can audit any number.
61. As an Arhtiya, I want the dashboard to also show today's activity and quick actions (New Trade, Issue Advance, Record Payment), so that the common flows are one tap away.
62. As an Arhtiya, I want a printable Kacha bill and Pakka invoice, so that I can hand the farmer and buyer their paperwork.

**Corrections & audit — [ADR-0011](../adr/0011-corrections-mutable-with-changelog.md)**
63. As an Arhtiya, I want to edit or delete a mis-entered trade or payment, so that I can fix mistakes.
64. As an Arhtiya, I want every change recorded in an append-only change log (who/when/old→new), so that disputes have a trail.
65. As an Arhtiya, I want balances to recompute after an edit, so that a correction never leaves a ledger out of sync.
66. As an Arhtiya, I want a warning when editing an entry whose money has already settled (cess remitted, labour paid, buyer cleared), with the change still logged, so that I don't silently rewrite closed history.
67. As an Arhtiya, I want to browse the chronological change/audit log, so that I can see the full history of corrections.

**Integrity, dating & resilience**
68. As an Arhtiya, I want a retried submission on a flaky connection to never double-post ([ADR-0021](../adr/0021-ledger-write-integrity.md)), so that one sale is recorded once.
69. As an Arhtiya, I want the underlying money history to be impossible to silently erase ([ADR-0021](../adr/0021-ledger-write-integrity.md)), so that the books are tamper-evident.
70. As a Munshi, I want to backdate an entry to the day the trade actually happened ([ADR-0023](../adr/0023-business-dating-timezone.md)), so that daily Rokar totals land on the correct day.
71. As an Arhtiya, I want daily figures grouped by Pakistan Standard Time ([ADR-0023](../adr/0023-business-dating-timezone.md)), so that the "day" matches my shop's day.
72. As an Arhtiya, I want my money history backed up daily off-platform ([ADR-0024](../adr/0024-backup-and-retention.md)), so that a catastrophe can't wipe the business.

**Presentation (UI conventions — [`docs/design.md`](../design.md))**
73. As a user, I want money shown in whole PKR and weights to 0.01 kg ([ADR-0009](../adr/0009-currency-and-precision.md)), so that figures match how I handle cash.
74. As a user, I want who-owes-whom shown with colour + an explicit label rather than a bare +/− sign, so that I never misread a balance direction.
75. As a user, I want each of the 7 ledgers to appear as a consistent colour-coded chip across the app, so that I recognise a ledger at a glance.
76. As a user, I want every data screen to have clear loading, empty, error, and disabled states, so that the app never leaves me guessing.
77. As a mobile user (future), I want the same features through a native app against the same API, so that I can run the shop from my phone.

## Implementation Decisions

- **Delivery boundary — two consumer surfaces** (from [`docs/architecture.md`](../architecture.md)):
  1. the **HTTP API** (REST, described by OpenAPI — [ADR-0016](../adr/0016-rest-api-openapi.md)) covering
     every capability below; and
  2. the **app screens** in [`docs/design.md`](../design.md) — the human-facing surface. A *user
     feature* is delivered only when it reaches a **screen backed by an endpoint**; a
     programmatic-only capability (e.g. the backup job) is delivered when it reaches the **API/worker**.
     Every issue slice must reach its surface — never stop at the pure engine.

- **Reuse the existing pure posting engine unchanged.** All financial truth already flows through one
  pure function `postTradeEntry(entry, config) -> { postings[], farmerBill, buyerInvoices[] }` plus the
  cash / settlement / godown / bardana / dashboard functions. This PRD adds the **route + persistence +
  UI** layers around it; it does **not** re-decide engine behaviour.

- **Ledgers are projections, never written directly.** The seven ledger balances are derived by
  folding the immutable posting stream; the API writes **entries + append-only postings**, and reads
  ledgers/bills/dashboards back as projections ([ADR-0010](../adr/0010-net-worth-definition.md)).

- **Seven ledgers** ([ADR-0004](../adr/0004-cess-government-liability-pool.md)): cash (Rokar), farmer
  (Zamindar), buyer (Pakka), labour (Thekedar, one account each), stock (Godown), revenue (Amdani),
  government (Cess liability).

- **Persistence** ([ADR-0014](../adr/0014-persistence-d1-drizzle.md)): Cloudflare D1 + Drizzle. Entities
  (schema-level, no file paths): `User` (id, name, role); `Customer` (role farmer|buyer|contractor;
  per-customer commission both-sides, cost-bearer defaults, Katt override); `Lot` (farmer, seq, status)
  → many `BagWeighRecord` (gross_kg); `TradeEntry` → many `SaleLine`; **`Posting`** (immutable: ledger,
  account, signed amount, kind, references, actor, business_date); `ChangeLog` (append-only: entity ref,
  field diff, actor, timestamp); `GodownState`, `BardanaLoan`; `Config`; an idempotency-key record.

- **Write integrity** ([ADR-0021](../adr/0021-ledger-write-integrity.md)): `postings` and `change_log`
  are **DB-enforced insert-only** (SQLite triggers that abort UPDATE/DELETE); every money-moving request
  carries a **client-generated ID** used as an idempotency key (safe retries); each posting/change stamps
  the authenticated **actor**.

- **Auth & RBAC** ([ADR-0020](../adr/0020-security-auth-model.md)): single shop, three roles — Owner /
  Bookkeeper / Viewer. All endpoints require authentication; the sensitive set (config, cess remittance,
  settled-entry edits, user management, genesis) is **Owner-only**. Login *mechanism* is deferred (see
  Out of Scope).

- **Genesis / opening balances** ([ADR-0022](../adr/0022-opening-balances-genesis.md)): a one-time dated
  genesis entry seeds opening cash, existing customer balances, bags-out, and stock, via the normal
  posting path; seed capital for reconciliation = opening equity.

- **Guard rails** ([ADR-0019](../adr/0019-guard-rails-reject-impossible.md)): reject the physically
  impossible — oversell (lot), over-resale (Godown), and any cash-out that would drive Rokar negative.

- **Dating** ([ADR-0023](../adr/0023-business-dating-timezone.md)): each entry carries a settable
  business date (default today) plus a UTC `created_at`; day-grouping uses midnight **PKT**.

- **Money & precision** ([ADR-0009](../adr/0009-currency-and-precision.md)): integer PKR, weight scale
  2, round half-up once at the line total; reconciliation requires **exactly-zero** drift.

- **Pricing rules** already in the engine: weight pipeline
  ([ADR-0002](../adr/0002-weight-model.md)/[ADR-0003](../adr/0003-katt-mechanics.md)); per-line then
  rollup ([ADR-0006](../adr/0006-splittable-lots.md)); both-side percentage commission, per-customer
  ([ADR-0012](../adr/0012-commission-both-sides.md)); cost-bearer precedence invoice > customer > global
  ([ADR-0001](../adr/0001-bardana-and-labor-cost-bearer.md)); flat-% cess
  ([ADR-0004](../adr/0004-cess-government-liability-pool.md)); Beopari cost basis = farmer net + labour,
  self-commission suppressed, Godown at running average cost
  ([ADR-0005](../adr/0005-beopari-flow.md)).

- **API contract** ([ADR-0016](../adr/0016-rest-api-openapi.md)): REST endpoints grouped by capability
  (auth/users, config, contacts, genesis, advances, bardana, lots/weighing, trades, cash actions,
  corrections, reads/dashboard, backup), described by a generated OpenAPI document; Zod schemas feed both
  validation and the spec.

- **Frontend** ([ADR-0017](../adr/0017-frontend-react-vite.md)): React + Vite, a **thin client** that
  calls the API and computes no postings. Screens per [`docs/design.md`](../design.md): Dashboard, New
  Trade, Ledgers, Contacts, Zamindar detail, Rokar cash book, Cess/Government, Issue Advance, Record cash
  action, Bardana tracker, Bill/Invoice view, Corrections & audit log. UI conventions: required states
  (loading/empty/error/disabled), money shown with colour + direction label, 7-ledger colour chips,
  Figma as visual truth. **Precedence:** if a design conflicts with an ADR, the system wins.

- **Backup** ([ADR-0024](../adr/0024-backup-and-retention.md)): keep D1 Time Travel and add a scheduled
  daily export to R2 (a Cron-triggered worker).

## Testing Decisions

- **What makes a good test:** assert **external behaviour**, never internal helpers or intermediate
  structure. For the engine: given a `TradeEntry` + config, the returned `postings[]`, `farmerBill`,
  `buyerInvoices[]`, and resulting ledger projections. For the API: given a request, the persisted state
  and the response body. For the UI: what the user sees for a given API state.

- **Three seams (existing preferred):**
  1. **Pure engine** — table-driven unit tests over `postTradeEntry` and the cash/settlement/godown/
     bardana/dashboard functions. **This already exists (89 passing tests)** and is the prior art all
     new engine cases copy: single-buyer sale; split lot; buyer- vs farmer-borne bag/labour;
     variable-weight bags + Katt; advance-repayment cascade; house-buyer purchase; resale P&L.
  2. **Route → engine → D1 integration** (vitest-pool-workers, Miniflare D1) — asserts each endpoint
     validates input, runs the engine, persists **append-only**, and returns the right bill/invoice/
     balance. Must cover: idempotent re-submission (no double-post), guard-rail **rejections**
     (oversell, negative Rokar, over-resale), append-only enforcement (UPDATE/DELETE aborts), and RBAC
     (Owner-only endpoints refuse a Bookkeeper). Prior art: the issue-1 walking-skeleton integration
     test.
  3. **Reconciliation oracle** — the invariant `True Shop Value == seed capital + retained profit ± open
     trading P&L` with **exactly-zero** drift, run across a multi-entry scenario that includes a genesis
     import and a Beopari purchase. This is the canonical re-run of the blueprint simulation under full
     rules.

- **UI is thin:** business logic is tested at the API seam, not re-tested through the UI. Frontend tests
  are limited to genuinely UI-level behaviour — money-direction/colour formatting, required-state
  rendering (loading/empty/error/disabled) — and screens are validated against the Figma frames.

## Out of Scope

**Delivery boundary — explicitly:** the **HTTP API** and the **web app screens** are both **in scope**.
Deliberately deferred consumer surfaces, named:

- **Native mobile app** — future; it will bind to the *same* API, so no API work is deferred, only the
  mobile client itself.
- **Auth login *mechanism*** (password vs OAuth, token format, session lifetime) — the role model and
  the "every endpoint authenticated" requirement are **in scope**, but the concrete mechanism is
  deferred to a **technical auth ADR** to be written when frontend auth is built.
- **UI component-library / styling / theming stack** — must be chosen (a **UI-stack ADR**, per
  `design.md`) before screens are built, but the choice itself is not decided in this PRD.

Also out of scope: multi-shop / multi-tenant; role permission matrices finer than the three fixed roles;
interest-bearing advances ([ADR-0008](../adr/0008-peshi-interest-free.md)); multi-currency
([ADR-0009](../adr/0009-currency-and-precision.md)); immutable-journal / point-in-time historical
reporting (v1 is mutable-with-changelog); printing/receipt hardware and SMS notifications;
commodity-specific cess slabs and percentage-of-gross Katt modes; flat rupees-per-maund commission
([ADR-0012](../adr/0012-commission-both-sides.md)); R2 export retention tuning.

## Further Notes

- **The engine is already built and proven** (89 tests incl. the reconciliation oracle). This PRD is the
  "give the engine a body" layer — API + persistence + UI + the financial NFRs — not a re-build of the
  domain logic. Only issue-1's four endpoints exist today; every other capability is engine-only and
  must be exposed to its delivery surface.
- **Slice full-stack, not by layer.** The prior cut produced engine-only issues (logic with no
  endpoints); this PRD names both delivery surfaces so `/to-issues` produces **vertical slices** that
  reach a screen + endpoint (or the API/worker, for programmatic-only capabilities).
- **Do not derive requirements from the blueprint's legacy worked example** (§2 of the blueprint) — it
  runs on 6-ledger / bag=maund simplifications and is a teaching trace only; the ADRs are authoritative.
- Three previously-open ADR follow-ups are now settled and reflected above: Beopari self-commission
  (suppressed), Godown valuation (average cost), and settled-entry editing (warn + changelog).
