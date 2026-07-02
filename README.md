# Project Starter — docs-driven agent methodology

A starter template for running a project **docs-first with coding agents**: decisions live in ADRs,
vocabulary in a glossary, work in tracer-bullet GitHub issues, and every guarantee is **enforced by
CI**, not by discipline. Copy this repo, follow the steps below, and the system steers any agent
(local or cloud) without you carrying state in your head.

> **The one principle — SSOT:** every fact lives in exactly ONE place; everything else links to it.
> The full "why" behind every rule is in [`RULEBOOK.md`](RULEBOOK.md).

---

## What's in the box

| File / dir | What it is | Who reads it |
| --- | --- | --- |
| `CLAUDE.md` | Agent front door — pointer table + rules of engagement. **Generic; don't edit.** | every agent, every session |
| `CONTEXT.md` | Project identity + landmines. **The one file you write per project.** `@`-imported into every turn — only lifetime-true facts. | every agent, every turn |
| `RULEBOOK.md` | The process guide — every rule with its why, plus copy-paste templates | you |
| `docs/adr/0000-*` | How the ADR system works (lifecycle, supersession, blast radius) | agents, on demand |
| `docs/adr/README.md` | The ADR catalog — one row per decision | agents, on demand |
| `docs/architecture.md` | Tech map stub — **holds the "Delivery boundary:" line** (fill before code) | `/to-prd`, `/to-issues` |
| `scripts/docs-lint.mjs` | Mechanical SSOT checks — dangling ADR refs, index drift, stale flags, missing files | CI, every push |
| `.github/workflows/ci.yml` | `docs-lint` job live from day one; `test` job commented, ready to enable | GitHub |
| `.claude/skills/` | The pipeline: `grill-with-docs` → `to-prd` → `to-issues` → `work-issues`, plus `tdd`, `audit`, `handoff`, `domain-modeling` | agents |

Files **not** here on purpose: `docs/glossary.md`, `docs/blueprint.md`, `docs/design.md`, ADRs
`0001+` — they are *created by the process* (lazily, when there's something to write), never
pre-scaffolded empty.

---

## Starting a new project — the steps

```
1. Copy      2. Identity     3. Grill         4. Tech          5. Work          6. Rails ⚠️      7. Build
   template  →  CONTEXT.md  →  ADRs+glossary →  architecture  →  PRD → issues  →  CI + protect  →  issue by issue
   (5 min)      (10 min)       (the real work)  (1–2 hrs)        (1 hr)           (30 min)          (ongoing)
```

### 1. Copy the template *(covers: version control, drift protection from day zero)*

Create the new repo from this template (GitHub → "Use this template", or push this branch to a fresh
repo's `main`). `docs-lint` is green from the first commit.

### 2. Write CONTEXT.md *(covers: the ~50 always-on tokens everything rides on)*

One identity line: what the project **is** — never what phase it's in (stage claims rot; this file
is loaded every turn forever). Leave landmines empty for now.

### 3. Run `/grill-with-docs` *(covers: decisions, vocabulary — "what is true")*

The relentless interview. Out of it come, **live during the session**:
- **ADRs `0001+`** — each hard-to-reverse, surprising, real-trade-off decision, with its why.
  ADR file is created first, *then* anything cites its number.
- **`docs/glossary.md`** — the ubiquitous language; `code_name` column = what code will actually use.
- **`docs/blueprint.md`** — optional narrative, if the domain is rich enough to need a story.

Then fill the **landmines** in `CONTEXT.md`: the 3–7 facts that corrupt everything if gotten wrong,
each citing its ADR. Finish every grill session with `npm run docs:lint` — it catches half-flipped
citations before they land.

### 4. Technical foundation *(covers: stack decisions, the shape of "done")*

- One **stack ADR per major choice** (runtime, DB, API style, UI).
- Fill `docs/architecture.md` — above all its **"Delivery boundary:"** line: the outermost surface
  a consumer touches (API / exports / CLI / screens). Every issue's acceptance must reach it; this
  single line is what prevents shipping tested logic with no product around it.
- Frontend? Add `docs/design.md` (template in RULEBOOK §T6) + a UI-stack ADR.

### 5. Generate the work *(covers: work SSOT, acceptance criteria)*

- `/to-prd` — synthesizes the ADRs into a **disposable** PRD (regenerate anytime, never hand-edit).
- `/to-issues` — tracer-bullet vertical slices, dependency-ordered via "Blocked by", each reaching
  the delivery boundary, labelled `ready-for-agent`.

### 6. Safety rails — **BEFORE any agent writes code** ⚠️

This ordering is a learned lesson: the first project using this system shipped 13 engine-only issues
on agent self-report before the rails existed.

```bash
# a. enable the test job: uncomment it in .github/workflows/ci.yml and adapt the commands
# b. protect main (requires the repo to be public, or a paid plan if private):
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": true, "contexts": ["docs-lint", "test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

`enforce_admins: true` is the load-bearing setting — agents authenticate as *you*, so without it the
gate is decorative. From here on: **"issue closed" = a machine verified green CI**, never an agent's
claim. Once code lands, also add: how-to-run to this README, `.env.example` (or `.dev.vars.example`
for Cloudflare Workers), and keep CI green.

### 7. Build — the daily rhythm *(covers: context hygiene, proven done)*

```
pick ONE unblocked issue          (or let /work-issues run the loop)
   │
   ▼
read its Governing ADRs → build test-first (/tdd, red→green)
   │
   ▼
tick acceptance boxes (each against the test that proves it)
   │
   ▼
branch → PR → CI green → merge → close issue
   │
   ▼
/clear (fresh context) → next issue        mid-task instead: /handoff or a
                                           3-line status comment on the issue
```

### Changing a decision later

Never edit a settled ADR — **supersede** (new ADR + flip old status + index), then walk the **blast
radius**: open issues, landmines, glossary rows, PRD. Protocol: `docs/adr/0000-*` §6. The lint
catches what the sweep misses.

---

## What each layer protects against

| Failure mode | Converted into |
| --- | --- |
| Agent doesn't know a domain rule | ADRs + landmines + glossary (it reads before building) |
| Agent builds logic with no usable surface | delivery boundary + slice completeness check |
| Agent hallucinates "tests pass" | red PR — protected main only merges on machine-verified green |
| Docs contradict each other / go stale | `docs-lint` fails the push within seconds |
| Context window rot mid-project | one-issue-per-context + `/handoff` |
| Old decision keeps steering after you changed your mind | supersession + blast radius + lint |
| Fresh machine / cloud agent can't start | this README + env example + self-contained skills |

**Honesty note:** no system "never fails." This one's guarantee is that failures become **visible,
cheap, and early** — a red check today instead of a silent corruption discovered next month.

## Commands

```bash
npm run docs:lint    # mechanical docs consistency check (also runs in CI)
/audit               # agent judgment checks the script can't do (slices reach the boundary, etc.)
```
