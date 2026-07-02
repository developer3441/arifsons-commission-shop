# ADR-0027 — UI stack: Tailwind CSS + shadcn/ui

**Status:** accepted · **Date:** 2026-07-02

## Context

The UI stack was never decided (design.md's Stack section sat at "TBD") while 15 screens shipped —
so agents improvised: inline `style={}` attributes everywhere, the 7-ledger colour map hardcoded as
hex values per file, no shared components, no tokens. An undecided decision gets improvised, and
improvisation duplicated values that design.md says must live in one config.

## Decision

**Tailwind CSS + shadcn/ui** on the React + Vite SPA (ADR-0017).

1. **Tokens are CSS variables in the Tailwind theme** — the SSOT for colour/spacing/type values,
   including the fixed **7-ledger colour mapping** (design.md owns the *mapping*, the config owns
   the *values*).
2. **shadcn/ui components are copied into the repo** (not a runtime dependency) — accessible
   primitives (Radix) agents know well and can extend without library lock-in.
3. **New UI work uses shared components and Tailwind classes.** Inline `style={}` is not used for
   anything a token or component should own.

Rejected: a full component library (Mantine/AntD/MUI — heavier, fights custom design); hand-rolled
CSS + tokens only (leaves component patterns to be improvised again, one level up).

## Consequences

- design.md's Stack section is filled; its conventions now have a concrete implementation target.
- Existing screens migrate via tracker issues: first the reference screen (ADR-0028), then the rest.
- Agents building screens follow shadcn patterns; a screen adding its own hex values or inline
  styles is a review finding, not a taste question.
