# ADR-0028 — Visual truth: design.md conventions + a reference screen (no per-screen Figma)

**Status:** accepted · **Date:** 2026-07-02

## Context

design.md declared a Figma file "the visual source of truth" and promised per-screen frames linked
from each issue. Neither existed: the file is a single untitled canvas, and no issue ever linked a
frame. A declared source of truth that doesn't exist is the same defect as any stale doc — worse,
because the issue pipeline (to-issues/work-issues) now *requires* linking the visual reference.
Maintaining real per-screen frames is ongoing design work a solo builder won't sustain.

## Decision

**The visual truth is `docs/design.md`'s conventions + tokens (ADR-0027) + one polished reference
screen — the Dashboard.**

1. The reference screen is built first and to a high standard; it *is* the visual spec.
2. Screen issues link the reference screen (a route/screenshot), not a design frame.
3. The screenshot attached to a screen-slice PR is judged against the reference screen and
   design.md's conventions.
4. No per-screen Figma frames are required or promised anywhere.

If real, maintained design files appear later (a designer joins, Stitch/Figma generation becomes
part of the flow), **supersede this ADR** — don't quietly re-promise frames.

## Consequences

- design.md drops the Figma claim; its "per-screen spec" pointer becomes issue + reference screen.
- to-issues / work-issues wording points at "the visual reference declared in design.md" so the
  skills survive this ADR being superseded.
- The first UI issue (restyle Dashboard) has no reference to match — it *creates* the reference;
  it is judged against design.md conventions alone, with human review of the PR screenshot.
