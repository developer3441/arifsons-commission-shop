# SplitEase — Design & UI standards

Living UI conventions the agent follows when building the frontend. Read on demand.

**Not here (so this doesn't duplicate):**
- The UI **stack decision** (component lib, styling, theming) → its own **UI ADR** when chosen.
- Token **values** (colors, spacing numbers) → the Tailwind/CSS config = SSOT.
- **Per-screen** specs → the GitHub issue + a linked **Figma** frame (Figma is the visual truth).

## Stack

_TBD — recorded in a UI ADR once chosen (component lib · styling · theming)._

## Conventions

- **Required states** for every data view: **loading · empty · error · disabled**. No screen ships
  without them.
- **Accessibility:** keyboard-navigable, visible focus ring, labelled controls, sufficient contrast.
- **Layout / spacing:** use the token scale — values live in the config, not restated here.
- **Money & weight:** display whole PKR rupees and 0.01 kg weights per [ADR-0009](adr/0009-currency-and-precision.md); never invent formatting.
- **Components:** prefer shared components; document a new pattern here as it emerges.

## Per-screen specs

Live in the GitHub issue for that screen, with a linked Figma frame — not in this file.
