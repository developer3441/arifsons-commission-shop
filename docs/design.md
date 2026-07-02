# SplitEase — Design & UI standards

Living UI conventions the agent follows when building the frontend. Read on demand.

**Visual source of truth ([ADR-0028](adr/0028-visual-truth-reference-screen.md)):** this file's conventions + the design tokens ([ADR-0027](adr/0027-ui-stack-tailwind-shadcn.md)) + the **Dashboard as the reference screen**. A new or restyled screen is judged against the reference screen and these conventions — via the screenshot attached to its PR. No per-screen design frames exist or are promised.

> **Precedence:** if a design (Figma, Stitch, mockup) conflicts with an **ADR**, `architecture.md`, or a
> domain rule, the **system wins** — conform the design to the rule, never build the conflict; flag it
> so the design gets fixed. Design is a narrative surface, like the blueprint; the ADR is authority.

**Not here (so this doesn't duplicate):**
- The UI **stack decision** → [ADR-0027](adr/0027-ui-stack-tailwind-shadcn.md) (Tailwind + shadcn/ui).
- Token **values** (colors, spacing numbers) → the Tailwind theme / CSS variables = SSOT.
- **Per-screen** specs → the GitHub issue + comparison against the **reference screen** (ADR-0028).

## Screens & navigation (map)

The index of app screens — one line each. The full **spec** for a screen lives in its GitHub issue;
the **visual** lives in Figma. Keep this list in sync as screens are added.

**Auth**
- **Login** — username + password; on success routes to the Dashboard (ADR-0025).
- **Users** (Owner-only) — create / list / deactivate shop-staff accounts and roles (ADR-0020).

**Primary navigation**
- **Dashboard** — two hero metrics (Cash in Hand, True Shop Value) + the 7 ledger balance cards +
  today's activity + quick actions (New Trade, Issue Advance, Record Payment).
- **New Trade** — the core mandi-sale flow: farmer → lot & weight (bags, Katt → payable maunds) →
  rate → buyers (split-lot) → both-side commission → cess → review → Kacha bill + Pakka invoice.
- **Ledgers** — the 7 ledgers as a grid; tap into any statement.
- **Contacts** — searchable farmers / buyers / contractors; opens their ledger.

**Ledger detail / statements**
- **Zamindar (farmer) detail** — balance + "owes you / you owe" label, running statement, issue
  advance / withdrawal, bardana lent out.
- **Rokar cash book** — cash in/out with a running balance.
- **Cess / Government** — cess held (liability) + "remit to government" action.
- **Godown (stock)** — house stock bought at cost (Beopari), resale flow, trading P&L (ADR-0005).

**Actions (modals / flows)**
- **Issue Advance (Peshi)** — interest-free cash advance to a farmer.
- **Record cash action** — buyer payment / farmer withdrawal / contractor (Thekedar) payout.
- **Bardana tracker** — bags lent out as an asset; issue / return.

**Documents & records**
- **Bill / Invoice view** — printable Kacha bill (farmer) & Pakka invoice (buyer).
- **Corrections & audit log** — chronological change history (append-only record).

**Setup (one-time / rare)**
- **Configuration** — shop defaults: commission rates, Katt, labour rate, cess (with per-customer overrides).
- **Genesis** — one-time opening-balances import for onboarding an existing shop (ADR-0022).

## Stack

**Tailwind CSS + shadcn/ui** — decided in [ADR-0027](adr/0027-ui-stack-tailwind-shadcn.md).
Tokens (incl. the fixed 7-ledger colour mapping) live as CSS variables in the Tailwind theme;
shadcn components are copied into the repo. Inline `style={}` is not used for anything a token or
shared component should own.

## Conventions

- **Required states** for every data view: **loading · empty · error · disabled**. No screen ships
  without them.
- **Accessibility:** keyboard-navigable, visible focus ring, labelled controls, sufficient contrast.
- **Layout / spacing:** use the token scale — values live in the config, not restated here.
- **Money & weight:** display whole PKR rupees and 0.01 kg weights per [ADR-0009](adr/0009-currency-and-precision.md); never invent formatting.
- **Money direction:** show who owes whom with **colour + an explicit label** ("owes you" / "you owe") —
  never a bare `+`/`−` sign. A negative farmer balance means "owes you", not a minus.
- **Ledger identity:** each of the **7 ledgers** ([ADR-0004](adr/0004-cess-government-liability-pool.md)) appears as a
  consistent **colour-coded chip** across the app — the colour *values* live in the token config, the *mapping* is fixed.
- **Components:** prefer shared components; document a new pattern here as it emerges.

## Per-screen specs

Live in the GitHub issue for that screen; the visual bar is the **reference screen** + the
conventions above (ADR-0028) — not in this file.
