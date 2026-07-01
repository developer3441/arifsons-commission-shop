# Project Rulebook — Docs, Skills & Decision Discipline

Portable, project-agnostic. **Copy into every new project.** Top = exact steps + paste-ready
templates. Bottom = the full "why" for each rule.

> **The one principle — SSOT:** every fact lives in exactly ONE place. **Link** between docs; never
> **copy** content. Files cost nothing until read; *duplication* is what costs you (drift).

---

# 🚀 QUICKSTART — starting a new project (do these in order)

1. `git init` and create the repo on GitHub.
2. Copy **`RULEBOOK.md`** (this file) into the repo root.
3. Create **`CLAUDE.md`** → paste the template in §T1 **verbatim** (change nothing).
4. Create **`CONTEXT.md`** → paste §T2; write the one-line description, leave landmines empty for now.
5. Create **`docs/adr/0000-record-architecture-decisions.md`** → paste §T3.
6. Create **`docs/adr/README.md`** (the index) → paste §T4.
7. Create **`docs/glossary.md`** if the domain has jargon.
8. Run **`/grill-me`** → hardens the design into ADRs `0001+` and the glossary.
9. Run **`/to-prd`** → **`/to-issues`** → PRD snapshot, then GitHub issues.
10. Fill in **`CONTEXT.md`** landmines (each citing its ADR).
11. **Before coding:** write technical ADRs for the stack + **`docs/architecture.md`** (tech map).
    Frontend? add **`docs/design.md`** (UI standards) + a UI-stack ADR once chosen (see R12).
12. **When code lands:** `README.md` (+ per-app) + `.env.example` + `.github/workflows/ci.yml`.

**Daily rhythm:** one issue per context → build → commit + push + close → `/clear` → next issue.
Build test-first by default (red-green) for domain logic — the `tdd` skill is the method. Run `/handoff` before clearing mid-task.

---

# 📋 TEMPLATES (copy-paste)

## §T1 — `CLAUDE.md` (generic; copy verbatim, only the title/one-liner live in CONTEXT.md)

```markdown
# Agent Guide

@CONTEXT.md

## Where things live — read on demand

| Need | Read |
| --- | --- |
| **Domain context** (actors, lifecycle, worked example) | `docs/blueprint.md` |
| **Vocabulary** | `docs/glossary.md` |
| **Rules & why** | `docs/adr/` — index: `docs/adr/README.md`; conventions: `docs/adr/0000-*` |
| **Tech map** (stack, data flow, where schema/API truth lives) | `docs/architecture.md` |
| **UI standards** (patterns, states, a11y) | `docs/design.md` |
| **What to build** | issue tracker (work SSOT); `docs/prd/` is a generated snapshot |

## Rules of engagement

1. **ADRs are the single source of truth for rules.** Read the relevant ADR before changing logic
   in its area; never silently re-decide a settled one.
2. **Use glossary vocabulary** in code, comments, and docs. New domain terms → `docs/glossary.md`.
3. **Blueprint is narrative, not authority.** If it and an ADR disagree, the **ADR wins**.
4. **Change a decision = supersede, never edit a settled ADR** (clarifications may be edited in
   place). Conventions & supersession protocol: `docs/adr/0000-*`.

*Test-first is the default for domain/business logic — drive it with the `tdd` skill (the red-green method lives there). Skip only for trivial/exploratory code.*
```

## §T2 — `CONTEXT.md` (project-specific; the one file you write per project)

```markdown
# <Project> — project context

<One line: what this project is.>

## Landmines — must not get wrong
*(Each cites its authority. If that ADR changes, update the line here too — `grep` the ADR number.)*

- <critical fact> (ADR-XXXX)
- <critical fact> (ADR-XXXX)
```

## §T3 — `docs/adr/0000-record-architecture-decisions.md`

```markdown
# ADR-0000 — Record architecture decisions (conventions)

**Status:** accepted · **Date:** <date>

## Context
We need decisions to be durable, readable, and immutable — not buried in code or chat. This ADR
records the decision to use ADRs and defines how we use them.

## Decision
1. **One decision per file.** `NNNN-kebab-title.md`, sequential; business + technical in one sequence.
2. **Status lifecycle:** `proposed → accepted → superseded` (also `rejected`, `deprecated`).
   Only `accepted` is in force; `superseded` = kept for history, do not follow.
3. **Edit in place vs supersede:** clarify/typo → edit in place; change what it *decides* → supersede.
4. **Supersession = create + status-flip:** new ADR (`accepted`, `Supersedes: XXXX`); old ADR status
   → `superseded by YYYY` (body kept as history). **Mandatory every time:** old ADR's status banner
   + the index.
5. **`0000` owns conventions; `README.md` owns the catalog.** Never mix.
6. **Blast radius — after superseding, propagate to what cites the ADR:**
   - **Find it:** `grep -rn "ADR-XXXX" CLAUDE.md CONTEXT.md docs/` and
     `gh issue list --state open --search "ADR-XXXX"`.
   - **Open issues:** acceptance criteria changed → edit them (repoint the ref, adjust criteria); a
     capability no issue covers → **open a new issue**. **Never rewrite closed/historical issues** —
     open a follow-up.
   - **Landmines (`CONTEXT.md`):** update a line only if its underlying fact changed.
   - **PRD (`docs/prd/`):** disposable snapshot — regenerate (`/to-prd`) only if the change is broad;
     skip for narrow ones.
   - **Doc cross-refs:** repoint live links, or rely on the superseded ADR's status banner to redirect.

## Consequences
- A complete, immutable decision log; the Supersedes/Superseded-by chain is the project memory.
- CLAUDE.md and issues reference ADRs by number/link; they never restate ADR content.
```

## §T4 — `docs/adr/README.md` (the index)

```markdown
# Architecture Decision Records — index

Catalog of decisions. **Conventions & lifecycle:** see [ADR-0000](0000-record-architecture-decisions.md).

> Status: `accepted` = in force · `superseded` = replaced, kept for history · `proposed` = draft

| ADR | Title | Type | Status |
| --- | --- | --- | --- |
| 0000 | Record architecture decisions (conventions) | meta | accepted |
```

## §T5 — an ADR file (`docs/adr/NNNN-title.md`)

```markdown
# ADR-NNNN — <title>

**Status:** accepted · **Date:** <date>

## Context
<the question / forces>

## Decision
<the choice>

## Consequences
<what follows; links to related ADRs>
```

## §T6 — `docs/design.md` (UI standards; only if the project has a frontend)

```markdown
# <Project> — Design & UI standards

Living UI conventions the agent follows when building the frontend. Read on demand.
**Not here:** the stack *decision* (→ a UI ADR), token *values* (→ Tailwind/CSS config), and
per-screen specs (→ the issue + a Figma frame; Figma is the visual truth).

## Stack
_TBD — recorded in a UI ADR once chosen (component lib · styling · theming)._

## Conventions
- **Required states** for every data view: loading · empty · error · disabled.
- **Accessibility:** keyboard-navigable, visible focus, labelled controls, sufficient contrast.
- **Layout/spacing:** use the token scale (values live in the config, not here).
- **Components:** prefer shared components; document new patterns here as they emerge.
```

Then add a `docs/design.md` pointer row to CLAUDE.md's "where things live" table.

---

# 📖 REFERENCE — the details

## R1. What each file means

| File / place | Meaning | Owns (SSOT for…) | Loaded every turn? |
| --- | --- | --- | --- |
| **CLAUDE.md** | agent front door — generic skeleton | rules of engagement + pointers | ✅ |
| **CONTEXT.md** | project identity + landmines (`@`-imported) | project-specific always-on facts | ✅ (inlined) |
| **README.md** | human front door — what it is + how to run | human onboarding | ❌ |
| **.env.example** | required env vars (committed, dummy values) | "what vars exist" | ❌ |
| **RULEBOOK.md** | your process guide (this file) | how you run projects | ❌ (personal) |
| **docs/blueprint.md** | domain story + worked example | narrative | ❌ |
| **docs/glossary.md** | the dictionary | vocabulary | ❌ |
| **docs/architecture.md** | tech map — stack, data flow, where code-truth lives | (points to code) | ❌ |
| **docs/adr/0000-*** | conventions — how ADRs work | ADR system rules | ❌ |
| **docs/adr/README.md** | index — which ADRs exist | catalog | ❌ |
| **docs/adr/NNNN-*** | one decision each | that rule | ❌ |
| **docs/prd/** | "what to build" — generated snapshot | (disposable) | ❌ |
| **Issue tracker** | living work + acceptance criteria | the work | per-issue |
| **code** (src, migrations, OpenAPI, tests) | self-documenting truth | schema, endpoints, tests | ❌ |
| **.github/workflows/ci.yml** | runs tests on every PR | (automation) | ❌ |

Rules→ADR. Vocab→glossary. Work→issues. Schema/endpoints/tests→code. Story→blueprint.
Stack→ADR + architecture.md. Never restate; **link**.

## R2. The two front doors + `@`-import

- **CLAUDE.md is generic** (copy verbatim). **CONTEXT.md is project-specific** (`@CONTEXT.md` inlines
  it every turn). Each landmine cites its ADR so a `grep` finds it when that ADR changes.
- **`@path`** = inlined every turn → only for small, every-turn files (CONTEXT.md). **Plain path/link**
  = read on demand → everything else. Every-turn behavioral rules live *directly* in CLAUDE.md (free).

## R3. Behavioral vs structural

- **CLAUDE.md rules of engagement = BEHAVIORAL** (how the agent works). Live in CLAUDE.md.
- **ADR-0000 = STRUCTURAL** (how the ADR system works). Lives in an ADR. CLAUDE.md *points* to it.

## R4. The skills pipeline

```
idea → /grill-me → ADRs + glossary → /to-prd → PRD (disposable) → /to-issues → GitHub issues
```
One-way: ADRs (rules) → PRD (what) → issues (work). **Tracer bullet** = thin *vertical* slice through
all layers, demoable alone, dependency-ordered. Small change → skip PRD, ADR → issue directly.
Skills are **manual** (`/grill-me`, `/to-prd`, `/to-issues`, `/handoff`) — **except `/tdd`**, which is
test-first by default (agent-invocable) per R6.

**Disposable vs keep:** PRD regenerates from issues → **delete anytime** (`/to-prd` rebuilds it).
Blueprint is the only end-to-end narrative → **keep it**. ADRs + issues are the load-bearing SSOT;
blueprint + PRD are the narrative/derived layer on top.

## R5. ADR rules
See §T3. One decision/file · lifecycle `proposed→accepted→superseded` · clarify=edit, decide=supersede ·
supersession = new ADR + flip old status + update index (mandatory) · 0000=conventions, README=catalog.

## R6. Testing — test-first by default
- **How** → the **method lives in the `tdd` skill** (red-green, behavior-via-public-interface); don't
  restate it here — the skill is the SSOT.
- **Policy** → test-first is the **default** for domain/business logic; skip only for trivial/exploratory code.
- **What** → each issue's acceptance criteria become the test cases.
- **Tests** → code, beside the app. **Layers:** unit (pure logic) / integration (API+DB) / one
  invariant-oracle. Not 100% coverage — test what matters.
- **Enforcement** → CI runs the suite on every PR. Local = fast feedback; CI = the gate.

## R7. Clean code
Enforced by **tooling, not prose**: Prettier + ESLint + strict TypeScript + pre-commit hooks (husky
+ lint-staged) + CI. The **config files are the SSOT** for style — don't write a style doc. Keep
architecture clean over time with the `improve-codebase-architecture` skill + `/code-review` / `/simplify`.

## R8. Human run-info & handoff
- **README.md** (root, + per app) = what it is + stack + how to run + links. **`.env.example`** =
  SSOT for env vars (real `.env` gitignored). README = how to *run*; architecture.md = how it's *built*.
- **Durable state = issues + git + PRs** (an agent resumes from these). Don't duplicate in a file.
- **Ephemeral state** before `/clear` → a 3-line status comment on the active issue (done/next/decision),
  or run `/handoff`. Push durable decisions into ADRs/issues; never let a handoff note become a 2nd SSOT.

## R9. Changing things (blast radius)
```bash
gh issue list --state open --search "ADR-XXXX"   # who depends on this rule?
grep -rn "ADR-XXXX" CLAUDE.md CONTEXT.md docs/    # which docs/landmines cite it?
```
Mandatory on a decision change: old ADR **status + index**. Then: edit only open issues whose
*acceptance criteria changed* (repoint the ref while there); regenerate PRD only if broad; update a
landmine if the fact changed; **never rewrite closed/historical** — open a follow-up. Repoint a
reference only when you're editing that issue anyway / it's being built now / the chain is >1 hop.

## R10. Context discipline
Only CLAUDE.md (+ `@`-imports) auto-loads → file count is irrelevant to context; optimize for SSOT.
One issue per context: build → commit → close → `/clear`. `/compact` if one issue runs long; `/handoff`
to clear mid-task. Descriptive filenames = fewer wasted reads.

## R11. Quick checklists (non-start operations)
**Making a change:** new/changed decision → write/supersede an ADR first → blast-radius query → update
only what's in radius → leave closed/historical alone.
**Superseding:** new ADR (`accepted`, `Supersedes: XXXX`) → flip old status (`superseded by YYYY`) →
update index (mandatory) → repoint live refs only per R9.
**Before `/clear`:** status comment on the active issue (done / next / decisions), or `/handoff`.

## R12. Design / UI
Split UI by *kind*, each to its own SSOT — don't cram it all in one place:
- **Stack decision** (component lib · Tailwind vs CSS-in-JS · theming) → its **own UI ADR** when chosen
  — a new file, **not** bolted onto the framework ADR (that would edit a settled decision, see R5).
- **Conventions** (patterns, required states loading/empty/error/disabled, a11y, layout) →
  **`docs/design.md`** (living), pointed to from CLAUDE.md.
- **Token *values*** (colors, spacing numbers) → **code** (Tailwind/CSS config) = SSOT; never restate in prose.
- **Per-screen spec** → the **issue** + a linked **Figma** frame (Figma = the visual truth).

Reference `design.md` from **CLAUDE.md** (read-on-demand pointer, ~15 always-on tokens), **not** CONTEXT.md.
Template: §T6.
