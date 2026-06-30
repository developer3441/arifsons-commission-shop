# SplitEase — Agent Guide

SplitEase is a bookkeeping system for an **Agri-Mandi Arhat (commission shop) & Beopari (trading)**
business. It records one trade on the mandi floor and fans it out across **7 ledgers**, tracking
both *Cash in Hand* and *True Shop Value*. Currently **design-stage** (docs only, no code yet).

## Where things live — read these on demand

| Need | Read |
| --- | --- |
| **Domain context** (what's an Arhtiya, the lifecycle, the worked simulation) | `docs/blueprint.md` |
| **Vocabulary** (Arhtiya, Zamindar, Pakka, Rokar, Katt, Bardana…) | `docs/glossary.md` |
| **Why a rule is the way it is** (the decisions) | `docs/adr/` — index at `docs/adr/README.md` |
| **What to build** (user stories, seams, tests) | `docs/prd/` — latest is the current spec |

## Rules of engagement

1. **ADRs are the single source of truth for rules.** Before changing logic in an area, read the
   relevant ADR (e.g. cess → `0004`, weight model → `0002`, net worth → `0010`). Do **not**
   silently re-decide something an ADR already settled.
2. **Use glossary vocabulary** in code, comments, and docs — `farmer` not `seller`, `maund` not
   `40kg-unit`, etc. New domain terms → add to `docs/glossary.md`.
3. **The blueprint is narrative, not authority.** If `docs/blueprint.md` and an ADR disagree, the
   **ADR wins** (the blueprint may describe an older simplification).
4. **A new decision = a new ADR**, never an edit to a settled one. Supersede, don't rewrite.

## Key facts an agent should not get wrong

- **7 ledgers, not 6** (cess is a government *liability* pool, never income — ADR-0004).
- **Bag ≠ maund**: track gross kg per bag → payable maunds after Katt (ADR-0002/0003).
- **Commission is charged on both sides** (farmer + buyer), configurable (ADR-0012).
- **True Shop Value** = full balance sheet incl. bags-lent-out (asset) and cess-held (liability)
  (ADR-0010). The reconciliation invariant is the canonical acceptance test.
- Money = whole PKR rupees; weight = 0.01 kg; round once at the line total (ADR-0009).

## Architecture intent (from the PRD)

- One **pure posting engine**: `postTradeEntry(entry, config) -> { postings[], farmerBill, buyerInvoices[] }`.
  All cash actions post through the same primitive.
- **Ledgers are projections** of an immutable posting stream — never written directly.
- Test-first against the **reconciliation oracle** (`True Shop Value == seed + retained profit ± trading P&L`).
