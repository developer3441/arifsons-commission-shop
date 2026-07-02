# ADR-0030 — Bilingual English/Urdu UI: i18n, RTL, Nastaliq, Western digits

**Status:** accepted · **Date:** 2026-07-02

## Context

The Munshi reads Urdu more comfortably than English; the Owner may prefer English on a laptop. The
v1 app is English-only with every string hardcoded inline — no i18n layer at all. Urdu is
right-to-left, which flips layout across every screen, so this must be decided before the restyle,
not retrofitted.

## Decision

**The UI is bilingual English/Urdu, user-switchable, defaulting to Urdu.**

1. **i18n:** every string is externalised into `en`/`ur` message files via a standard i18n library
   (react-i18next). No hardcoded UI strings.
2. **Preference:** language is a **per-user persisted** setting (one Munshi picks Urdu, the Owner
   may pick English). The app flips **LTR ⇄ RTL at runtime** to match.
3. **RTL-safe by construction:** use CSS **logical properties** (`margin-inline`, `inset-inline`,
   etc.) — never hard-coded left/right — so both directions work from one stylesheet.
4. **Font — Nastaliq, self-hosted:** Urdu renders in Noto Nastaliq Urdu (self-hosted, subsetted
   woff2, `font-display: swap`). Because Nastaliq is tall and calligraphic, Urdu mode uses
   **larger base size and taller line-heights**, and dense rows get extra vertical space — which
   fits the mobile-first single-column direction (ADR-0029).
5. **Numerals — Western digits (0-9) always,** in both languages. Money and weights keep the same
   shape across the language toggle (only words translate). Digits render in a Latin font span so
   they stay crisp inside Nastaliq text. Rationale: legibility and fewer transcription errors in a
   money app; matches common Pakistani ledger practice.

## Consequences

- Meaningful ongoing cost: every new label is a key in two message files; every screen is tested in
  both directions. Accepted as core to the product, not optional polish.
- Domain terms stay transliterated where they are proper nouns (Zamindar, Rokar), with Urdu-script
  equivalents supplied through the `ur` message file as translation matures.
- Tokens (ADR-0027) carry the Urdu type scale (larger base, taller leading) as a mode, not a fork.
