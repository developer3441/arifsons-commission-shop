# Glossary format (`docs/glossary.md`)

## Structure

Tables grouped by natural clusters (actors, lifecycle, units, documents, …), one row per term:

```md
# <Project> — Domain Glossary

Shared vocabulary. `code_name` = the identifier actually used in code.

> Status: ✅ defined & agreed · 🟡 defined, open question · ❓ undefined / to decide

## Actors
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Arhtiya | `agent` | Commission agent / shop owner. The "you". | ✅ |
| Thekedar | `labor_contractor` | Labour contractor; shop settles with him, not workers. | ✅ many — [ADR-0007](../../docs/adr/0007-multiple-thekedars.md) |
```

## Rules

- **Be opinionated.** When multiple words exist for the same concept, pick one canonical term; note rejected synonyms in the Meaning cell ("not: client, account").
- **Keep definitions tight.** One or two sentences max. Define what it IS, not what it does.
- **`code_name` must match the code.** It is the identifier the code actually uses (check the domain types), not an aspirational name. If code and glossary disagree, one of them is wrong — surface it.
- **Status cites its authority.** A ✅ that rests on a decision links the ADR; a 🟡 names the open question and the ADR that will settle it. When that ADR is accepted, flip the flag in the same change (docs-lint enforces this).
- **Only domain terms belong.** General programming concepts (timeouts, error types, utility patterns) don't — even if the project uses them everywhere.

## What does NOT go here

- **Identity + landmines** → `CONTEXT.md` (always-on; one line per critical fact, each citing an ADR)
- **The decisions themselves** → `docs/adr/`
- **Narrative / worked examples** → `docs/blueprint.md`

## Multi-context repos

If the repo has multiple bounded contexts, a `CONTEXT-MAP.md` at the root lists them, where each lives, and how they relate; each context keeps its own glossary. If no map exists, the repo is single-context: one `docs/glossary.md`.
