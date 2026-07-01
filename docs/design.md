# SplitEase — Design & UI standards

Living UI conventions the agent follows when building the frontend. Read on demand.

> **Precedence:** if a design (Figma, Stitch, mockup) conflicts with an **ADR**, `architecture.md`, or a
> domain rule, the **system wins** — conform the design to the rule, never build the conflict; flag it
> so the design gets fixed. Design is a narrative surface, like the blueprint; the ADR is authority.

**Not here (so this doesn't duplicate):**
- The UI **stack decision** (component lib, styling, theming) → its own **UI ADR** when chosen.
- Token **values** (colors, spacing numbers) → the Tailwind/CSS config = SSOT.
- **Per-screen** specs → the GitHub issue + a linked **Figma** frame (Figma is the visual truth).

## Screens & navigation (map)

The index of app screens — one line each. The full **spec** for a screen lives in its GitHub issue;
the **visual** lives in Figma. Keep this list in sync as screens are added.

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

**Actions (modals / flows)**
- **Issue Advance (Peshi)** — interest-free cash advance to a farmer.
- **Record cash action** — buyer payment / farmer withdrawal / contractor (Thekedar) payout.
- **Bardana tracker** — bags lent out as an asset; issue / return.

**Documents & records**
- **Bill / Invoice view** — printable Kacha bill (farmer) & Pakka invoice (buyer).
- **Corrections & audit log** — chronological change history (append-only record).

## Stack

_TBD — recorded in a UI ADR once chosen (component lib · styling · theming)._

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

Live in the GitHub issue for that screen, with a linked Figma frame — not in this file.
