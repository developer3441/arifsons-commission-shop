---
title: "SplitEase v1 — Mandi Ledger & Trade Engine"
triage-label: ready-for-agent
status: ready-for-agent
glossary: docs/glossary.md
adrs: docs/adr/  (0001–0012)
date: 2026-06-30
---

# SplitEase v1 — Mandi Ledger & Trade Engine

> ⚠️ **Generated snapshot — do not hand-edit.** Regenerate with `/to-prd` when the ADRs change.
> The source of truth for **rules** is `docs/adr/`; for **work**, the issue tracker. This PRD is the
> disposable bridge between them. Vocabulary follows [`docs/glossary.md`](../glossary.md). Where this
> PRD and an ADR disagree, the **ADR wins**.

## Problem Statement

An **Arhtiya** (commission shop owner) running a grain **Mandi** keeps everyone's money in paper
registers. The cash in the drawer is not profit — it is a mix of **Zamindar** (farmer) payouts
owed, **Thekedar** (labour) wages held, and government **Cess** collected for the market
committee. At the same time, real value sits *outside* the drawer as interest-free **Peshi**
advances and **Bardana** (bags) lent to farmers. The shopkeeper cannot reliably answer two
questions: *"How much physical cash can I pay out right now?"* and *"Is the business worth more
than the capital I started with?"* One mis-entered auction or a forgotten advance silently
corrupts every downstream balance, and money disputes have no audit trail.

## Solution

A bookkeeping system that records a single **trade entry** on the Mandi floor once and fans it out,
automatically and consistently, across **seven ledgers** (*Rokar*, *Zamindar*, *Pakka*, *Thekedar*,
*Godown/Mal*, *Amdani/Kharch*, *Government/Cess*). From one entry it derives the farmer's **Kacha**
bill and each buyer's **Pakka** invoice, posts every commission / labour / bag / cess / advance
consequence to the correct ledger, and always shows two separate headline numbers:

- **Cash in Hand** — physical cash in the *Rokar* ledger.
- **True Shop Value** — the full balance sheet: cash + buyer receivables + Godown stock value +
  bardana lent out − farmer payouts owed − outstanding labour − cess held
  ([ADR-0010](../adr/0010-net-worth-definition.md)).

Both business models run under one roof: pure commission (**Arhat**) and proprietary trading
(**Beopari**), the latter modelled as the shop buying through the same auction as an internal
"house" buyer ([ADR-0005](../adr/0005-beopari-flow.md)).

## User Stories

**Setup & configuration**
1. As an Arhtiya, I want to set a global default commission rate, so that most sales price themselves without per-deal entry.
2. As an Arhtiya, I want separate farmer-side and buyer-side commission rates ([ADR-0012](../adr/0012-commission-both-sides.md)), so that I can run kacha and pakka arhat in one shop.
3. As an Arhtiya, I want to override commission per customer, so that legacy farmers get negotiated rates and high-risk clients pay premium.
4. As an Arhtiya, I want to set a default **Katt** (fixed kg/bag), labour rate per bag, and empty-bag value ([ADR-0003](../adr/0003-katt-mechanics.md)), so that deductions compute automatically.
5. As an Arhtiya, I want to set an opening *Rokar* cash balance, so that the books start from my real drawer.
6. As an Arhtiya, I want a default cost-bearer for bag/labour with per-deal override ([ADR-0001](../adr/0001-bardana-and-labor-cost-bearer.md)), so that I can pass those costs to the buyer when the market expects it.

**Customers**
7. As an Arhtiya, I want to create a *Zamindar* account, so that I can track that grower's advances, bags, and payouts.
8. As an Arhtiya, I want to create a *Pakka* (buyer/mill) account, so that I can extend and track credit on auctions they win.
9. As an Arhtiya, I want multiple *Thekedar* accounts ([ADR-0007](../adr/0007-multiple-thekedars.md)), so that I can route and settle labour with each crew separately.
10. As an Arhtiya, I want per-customer commission and cost-bearer overrides, so that their deals price correctly by default.
11. As an Arhtiya, I want to read any customer's running balance and what its sign means (they owe me / I owe them), so that I always know our standing.

**Pre-season banking (Peshi & Bardana)**
12. As an Arhtiya, I want to issue a cash **Peshi** advance to a farmer, so that I fund their season and secure their harvest.
13. As an Arhtiya, I want advances to be interest-free ([ADR-0008](../adr/0008-peshi-interest-free.md)), so that the books match the real verbal contract.
14. As an Arhtiya, I want issuing an advance to debit the farmer ledger and reduce *Rokar* cash in one action, so that both sides stay consistent.
15. As an Arhtiya, I want to lend empty **Bardana** bags to a farmer, so that they can bag crops in the field.
16. As an Arhtiya, I want lent bags tracked as a farmer receivable / asset-in-the-field, not a loss, so that True Shop Value stays accurate.

**Lot lifecycle**
17. As an Arhtiya, I want to register an arriving **Lot** with a sequential number against a farmer, so that I can track it through its lifecycle.
18. As a Munshi, I want to record each bag's **gross kg** at weighing ([ADR-0002](../adr/0002-weight-model.md)), so that variable-weight bags price correctly.
19. As a Munshi, I want the system to derive **payable maunds** from gross kg minus Katt, so that I price on payable weight, not water weight.
20. As an Arhtiya, I want to record an auction as one or more **sale lines** ([ADR-0006](../adr/0006-splittable-lots.md)), each with a buyer, a quantity/bag subset, and a rate per maund, so that I can split a lot across buyers.
21. As an Arhtiya, I want to sell a lot to myself as the **house buyer** ([ADR-0005](../adr/0005-beopari-flow.md)), so that I can stock grain for off-season trading through the normal flow.

**Single-entry trade & invoices**
22. As a Munshi, I want to save a completed trade entry once and get both the **Kacha** bill and each **Pakka** invoice, so that I never double-key figures.
23. As an Arhtiya, I want the farmer's bill to show gross minus farmer-side commission, farmer-borne labour/bag costs, and advance deductions, so that the farmer sees an itemised settlement.
24. As an Arhtiya, I want the buyer's invoice to show gross plus cess, plus buyer-side commission and any buyer-borne labour/bag costs, so that the buyer sees exactly what they owe.
25. As an Arhtiya, I want commission/labour/bag/cess computed per sale line then rolled up, so that split sales total correctly.
26. As an Arhtiya, I want a saved trade to post automatically to every affected ledger, so that the books reconcile without manual journal entries.

**Automated settlement cascade**
27. As an Arhtiya, I want crop proceeds to first repay any outstanding Peshi/bag debt automatically, so that old loans clear before payout.
28. As an Arhtiya, I want surplus proceeds to become a positive farmer balance they can withdraw later, so that I can safely hold their money.
29. As an Arhtiya, I want winning purchases to debit the buyer's *Pakka* account, so that credit owed is tracked until paid.
30. As an Arhtiya, I want each lot's labour to accumulate on the chosen contractor's ledger, so that I know what each crew is owed.
31. As an Arhtiya, I want cess collected to accumulate in the Government/Cess liability ledger ([ADR-0004](../adr/0004-cess-government-liability-pool.md)), so that I never confuse it with profit.
32. As an Arhtiya, I want only commission (both sides) to land in *Amdani* revenue, so that profit reflects pure earnings.

**Cash movements (settle-up)**
33. As an Arhtiya, I want to record a buyer clearing their tab, so that *Rokar* rises and their *Pakka* balance hits zero.
34. As an Arhtiya, I want to pay a contractor their accumulated wages, so that *Rokar* falls and that *Thekedar* balance hits zero.
35. As an Arhtiya, I want to pay a farmer a full or partial withdrawal, so that *Rokar* falls and their balance reduces by what they took.
36. As an Arhtiya, I want to remit collected cess to the market committee, so that *Rokar* falls and the Cess liability hits zero.
37. As an Arhtiya, I want *Rokar* touched only when physical cash/bank actually moves, so that cash tracking stays literal.

**Proprietary trading (Beopari / Godown)**
38. As an Arhtiya, I want a house-buyer purchase to move grain into *Godown* at cost = bid + haul-in labour, so that inventory carries a correct cost basis.
39. As an Arhtiya, I want *Godown* to track bag count, net weight, and running average cost per kg, so that I know my stocked position.
40. As an Arhtiya, I want to later sell stored stock to a real buyer, so that I realise trading profit separate from commission income.

**Dashboard & reporting**
41. As an Arhtiya, I want **Cash in Hand** and **True Shop Value** shown as two separate pillars, so that I never mistake held money for profit.
42. As an Arhtiya, I want True Shop Value to include bags-lent-out as an asset and cess-held as a liability, so that it reconciles with no manual fudge.
43. As an Arhtiya, I want a profit-based figure (seed capital + retained profit) shown as a reconciliation check, so that a mismatch warns me of a bookkeeping error.
44. As an Arhtiya, I want to view each of the seven ledgers and drill into the entries behind a balance, so that I can audit any number.

**Corrections & audit**
45. As an Arhtiya, I want to edit or delete a mis-entered trade or payment, so that I can fix mistakes.
46. As an Arhtiya, I want every change recorded in an append-only change log (who/when/old→new) ([ADR-0011](../adr/0011-corrections-mutable-with-changelog.md)), so that disputes have a trail.
47. As an Arhtiya, I want balances to recompute after an edit, so that a correction never leaves a ledger out of sync.
48. As an Arhtiya, I want a warning when editing a settled invoice or completed payout, so that I don't silently rewrite closed history.

**Money & precision**
49. As an Arhtiya, I want all money in whole PKR rupees and weights to 0.01 kg ([ADR-0009](../adr/0009-currency-and-precision.md)), so that figures match how I handle cash.
50. As an Arhtiya, I want rounding applied once at the line total, so that split-line rollups don't drift by rupees.

## Implementation Decisions

- **Core seam — one pure posting engine.** All financial truth flows through a single pure
  function: `postTradeEntry(entry, config) -> { postings[], farmerBill, buyerInvoices[] }`. Given a
  trade entry (lot + sale lines + per-customer config) it returns the full set of double-entry-style
  postings plus the derived Kacha/Pakka documents, with no I/O. Cash actions (advance, payout,
  buyer payment, contractor pay, cess remittance) post through the **same** posting primitive.
  Highest, fewest-seam design (ideal = 1).
- **Ledgers are projections, not authorities.** The seven ledger balances are **derived** by
  folding the immutable posting stream; they are never written directly. Recompute-after-edit
  ([ADR-0011](../adr/0011-corrections-mutable-with-changelog.md)) becomes trivial and cross-ledger
  consistency is guaranteed.
- **Seven ledgers** ([ADR-0004](../adr/0004-cess-government-liability-pool.md)): `cash_ledger`
  (Rokar), `farmer_ledger`, `buyer_ledger`, `labor_ledger` (per contractor), `stock_ledger`
  (Godown), `revenue_ledger` (Amdani/Kharch), `govt_ledger` (Cess liability).
- **Entities (schema-level, no file paths):** `Customer` (role: farmer | buyer | contractor;
  per-customer commission both-sides, cost-bearer defaults, Katt override); `Lot` (farmer, seq
  number, status) → many `BagWeighRecord` (gross_kg); `TradeEntry` → many `SaleLine` (buyer,
  quantity/bag subset, rate_per_maund, bearer toggles); `Posting` (immutable: ledger, account,
  signed amount, kind, references); `ChangeLog` (append-only: entity ref, field diff, actor, ts).
- **Weight pipeline** ([ADR-0002](../adr/0002-weight-model.md)/[ADR-0003](../adr/0003-katt-mechanics.md)):
  `payable_kg = max(0, gross_kg − katt_kg_per_bag)`; `payable_maunds = Σ payable_kg / 40`;
  `line_gross = rate_per_maund × line_payable_maunds`. 1 maund = 40 kg.
- **Per-line then rollup** ([ADR-0006](../adr/0006-splittable-lots.md)): commission, labour, bag,
  cess compute per `SaleLine`; the farmer bill sums lines for the lot.
- **Cost bearer** ([ADR-0001](../adr/0001-bardana-and-labor-cost-bearer.md)): each bag/labour
  charge carries `bearer: farmer | buyer`; `buyer` posts the charge to the Pakka side and nets the
  farmer's corresponding debt to zero (the "absorbed" case).
- **Beopari** ([ADR-0005](../adr/0005-beopari-flow.md)): house-buyer sale lines post a Godown stock
  entry (cost = bid + haul labour) instead of a buyer receivable. Open follow-up: book vs suppress
  self-commission — to be decided by the reconciliation test.
- **Settlement cascade** (README §6): on save, proceeds repay outstanding advance/bag debt first;
  remainder becomes a positive farmer balance.
- **Money/precision** ([ADR-0009](../adr/0009-currency-and-precision.md)): integer PKR, weight
  scale 2; round once at the line total; full precision on intermediates.
- **Net-worth projection** ([ADR-0010](../adr/0010-net-worth-definition.md)): True Shop Value and
  the profit-based oracle are both pure functions of the ledger projections.

## Testing Decisions

- **What makes a good test:** assert on external behaviour of the posting engine — given a
  `TradeEntry` + `config`, the returned `postings[]`, `farmerBill`, `buyerInvoices[]`, and the
  resulting ledger projections. Never assert on internal helpers or intermediate structure.
- **Primary seam under test — `postTradeEntry`.** Table-driven cases: single-buyer sale; split lot
  across buyers; buyer-borne vs farmer-borne bag/labour; variable-weight bags + Katt; a sale that
  triggers advance repayment; a house-buyer (Beopari) purchase into Godown. Each case states the
  input entry and the expected postings + bill/invoice totals.
- **Cash-action cases** post through the same engine: advance issue, buyer payment, contractor
  payout, farmer partial withdrawal, cess remittance — each asserting resulting ledger deltas.
- **Reconciliation invariant (the oracle):** after any sequence of entries,
  `True Shop Value == seed capital + retained profit ± open trading P&L` within rounding tolerance
  ([ADR-0010](../adr/0010-net-worth-definition.md)). This is the canonical re-run of the blueprint
  simulation under full rules and the test that decides the Beopari self-commission follow-up.
- **Change-log test** ([ADR-0011](../adr/0011-corrections-mutable-with-changelog.md)): editing a
  saved entry yields an append-only log row and recomputed balances; the log is never mutated.
- **Prior art:** none (greenfield). These table-driven engine tests are the prior art future
  features should copy.

## Out of Scope

- UI/UX visual design, platform choice (web vs mobile), and the rendering layer.
- Authentication, multi-user roles/permissions, multi-shop tenancy.
- Interest-bearing advances (interest-free for v1 — [ADR-0008](../adr/0008-peshi-interest-free.md)).
- Multi-currency (PKR only — [ADR-0009](../adr/0009-currency-and-precision.md)).
- Immutable-journal / point-in-time historical reporting (v1 is mutable-with-changelog).
- Printing/receipt hardware, SMS notifications.
- Commodity-specific cess slabs and percentage-based Katt modes (ADR follow-ups).

## Further Notes

- The blueprint [`README_1.md`](../../README_1.md) is reconciled to all 12 ADRs (6→7 ledgers; the
  bardana contradiction and the net-worth fudge are fixed).
- Three open follow-ups live inside ADRs, best resolved during build via the reconciliation test:
  Beopari self-commission booking (0005), Godown stock valuation basis (0010), and which entry
  types lock after settlement (0011).
- **Publishing:** this repo still has no issue tracker / triage-label vocabulary configured (not a
  git repo, no remote), so this PRD is published to `docs/prd/` with the intended `ready-for-agent`
  label in frontmatter. To push to a real tracker, run `/setup-matt-pocock-skills` in an
  interactive session to supply tracker + labels, then re-publish.
