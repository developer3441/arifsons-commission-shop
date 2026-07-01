---
name: audit
description: Verify a project's docs scaffold is actually wired — every required file exists AND holds its load-bearing content (delivery boundary, ADR citations, index consistency, end-to-end issues). Reports pass/fail, does not silently fix.
disable-model-invocation: true
---

# Audit

Run the **Scaffolding audit** (RULEBOOK R13): confirm the project's docs system exists *and* is
internally consistent. This is a read-and-report pass — surface problems, propose fixes, but do NOT
edit anything unless the user says so.

## Process

### 1. Detect project shape

Read `CONTEXT.md` and `docs/architecture.md` first. Determine:
- **Delivery boundary** — the "Delivery boundary:" line in `docs/architecture.md` (API / exports / CLI / UI). If absent, that is finding #1.
- **Frontend?** — is there a UI surface (design.md, a UI-stack ADR, a `frontend/`)? Gates the UI rows.
- **Code landed?** — is there app code yet? Gates README / .env.example / CI rows.

Rows that don't apply to this project are **N/A**, not failures.

### 2. Check each row (must-exist + must-contain)

A file that exists but lacks its load-bearing content **still fails** — check content, not just presence.

| # | File | Load-bearing content to verify | Applies |
| --- | --- | --- | --- |
| 1 | `CLAUDE.md` | "where things live" table + rules of engagement | always |
| 2 | `CONTEXT.md` | identity line + landmines, **each citing an ADR** | always |
| 3 | `docs/architecture.md` | a one-line **"Delivery boundary:"** naming the consumer surface | before code |
| 4 | `docs/adr/0000-*` | ADR conventions incl. blast-radius protocol | always |
| 5 | `docs/adr/README.md` | an index row for **every** ADR file; statuses match each file's banner | always |
| 6 | `docs/adr/NNNN-*` | one decision each; a **stack** ADR per major choice (runtime/DB/API/UI) | before code |
| 7 | `docs/glossary.md` | the domain's terms | if jargon |
| 8 | `docs/design.md` + UI-stack ADR | UI conventions + "system wins" precedence | if frontend |
| 9 | Issues | **every open issue's acceptance reaches the delivery boundary** — not logic-only | after `/to-issues` |
| 10 | `README.md` · `.env.example` · CI workflow | how-to-run · env var names · tests run on PR | once code lands |

For **row 5**: list ADR files (`ls docs/adr/`), list index rows, diff them both ways — a file with no
index row, or an index row whose status contradicts the file's banner, is a finding.

For **row 9**: read open issues (`gh issue list --state open`); an issue whose acceptance criteria only
assert internal/pure-logic behaviour (no consumer-facing surface) when the delivery boundary is above
that layer is a finding — cite it. (A pure-library boundary that *is* the function is a pass.)

### 3. Cross-consistency (the SSOT checks)

- **Dangling ADR refs:** every `ADR-XXXX` cited in `CLAUDE.md` / `CONTEXT.md` / `docs/` / issues
  resolves to a real ADR that is not `superseded` (or the ref rides a superseded ADR's redirect banner).
  Find with `grep -rn "ADR-[0-9]" CLAUDE.md CONTEXT.md docs/`.
- **Duplication:** no fact is *restated* where it should be *linked* (rules→ADR, vocab→glossary,
  boundary→architecture.md only). Flag prose that copies an ADR/glossary/boundary instead of linking.
- **Stale PRD:** if `docs/prd/` exists, spot-check it against current ADRs; if it contradicts them, note
  "regenerate with `/to-prd`".

### 4. Report

Output a compact table: **# · item · ✅ pass / ❌ fail / ➖ N/A · offending file + one-line reason**.
Then a short prioritized fix list. **Fix at the source, never patch a copy:** missing delivery boundary
→ add the line to `architecture.md`; engine-only issues → extend acceptance to the boundary (RULEBOOK
R4); dangling ADR ref → repoint per R9; duplication → replace the copy with a link.

Do not apply fixes in this pass. End by asking which findings to fix.
