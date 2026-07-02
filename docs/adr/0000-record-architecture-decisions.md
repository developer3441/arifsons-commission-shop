# ADR-0000 — Record architecture decisions (conventions)

**Status:** accepted · **Date:** 2026-06-30

## Context

We need the *why* behind decisions to be durable, readable, and immutable — not buried in code or
chat history. This ADR records the decision to use ADRs, and defines how we use them.

## Decision

1. **One decision per file.** Filenames are `NNNN-kebab-title.md`, numbered sequentially.
   **Business and technical decisions share one sequence** (stack/DB/architecture ADRs sit beside
   domain ADRs). Descriptive slugs so the right file is pickable from its name.
2. **Status lifecycle:** `proposed → accepted → superseded` (also `rejected`, `deprecated`).
   - `accepted` — in force; obey it.
   - `superseded` — replaced by a newer ADR; kept for history, **do not follow**.
3. **Edit in place vs supersede:**
   - Clarify / fix a typo / add an example — **decision unchanged → edit in place.**
   - Change what the rule **decides → supersede** (never edit a settled decision).
4. **Supersession is create + status-flip (two files):**
   - **Create** the new ADR: `Status: accepted`, `Supersedes: ADR-XXXX`.
   - **Flip** the old ADR's status only: `Status: superseded by ADR-YYYY` (body left as history).
   - **Mandatory every time:** the old ADR's status banner **and** the index. These are the
     redirect mechanism — without them nothing self-resolves.
5. **Index.** `docs/adr/README.md` is the catalog (number, title, type, status). It should be kept
   trivial (ideally generated) so it never drifts.
6. **Blast radius — after superseding, propagate to what cites the ADR:**
   - **Find it:** `grep -rn "ADR-XXXX" CLAUDE.md CONTEXT.md docs/` and
     `gh issue list --state open --search "ADR-XXXX"`.
   - **Open issues:** acceptance criteria changed → edit them (repoint the ref, adjust criteria); a
     capability no issue covers → **open a new issue**. **Never rewrite closed/historical issues** —
     open a follow-up.
   - **Landmines (`CONTEXT.md`):** update a line only if its underlying fact changed.
   - **Glossary (`docs/glossary.md`):** grep the ADR number there too — update any row whose fact
     changed. The same sweep applies when a new ADR is **accepted**: flip any 🟡 open-question flag
     that the new decision settles (enforced mechanically by `npm run docs:lint`).
   - **PRD (`docs/prd/current.md`):** ephemeral scaffold, usually absent (deleted once its issues are
     cut). **Not** a blast-radius target — the work SSOT is the **issues**. Regenerate via `/to-prd`
     only if you are actively re-slicing an epic.
   - **Doc cross-refs:** repoint live links, or rely on the superseded ADR's status banner to redirect.

## Consequences

- A complete, immutable decision log; the `Supersedes`/`Superseded by` chain is the project memory.
- Changing a decision is cheap and traceable: supersede, then propagate to the blast radius (§6).
- `CLAUDE.md` and issues reference ADRs by number/link; they never restate ADR content.
