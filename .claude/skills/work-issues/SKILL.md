---
name: work-issues
description: Autonomously work the repo's open GitHub issues in dependency order — pick the next unblocked issue, solve it per CLAUDE.md, then tick its boxes, commit, push, and close. Loops until no unblocked issue remains. Use when the user says "work the issues", "burn down the backlog", or wants autonomous issue-solving.
disable-model-invocation: true
---

# Work Issues — autonomous backlog burndown

Solve the repo's open issues one at a time, in dependency order, following the project's own
rules. This skill is only the **loop** — **CLAUDE.md is the source of truth for *how* to work**
(rules, ADRs, test-first, definition-of-done). Read CLAUDE.md first; do not restate it here.

## Loop

Repeat until no unblocked open issue remains:

1. **List** open issues: `gh issue list --state open`.
2. **Pick the next unblocked issue.** Every issue has a `## Blocked by` section — an issue is
   *unblocked* only when every issue it lists is **CLOSED**. Choose the lowest-numbered unblocked one.
3. **Work it** — see *Per issue* below.
4. **Finish it** per CLAUDE.md's definition of done: tick the acceptance-criteria boxes (each
   against the test that proves it) → commit on an issue branch → push → open a PR → merge once
   CI is green → close with a note referencing the PR. `main` is protected; direct pushes fail.

When no unblocked issue is left, **stop** and report what's done and what's still blocked (and why).

## Per issue

Work it exactly as CLAUDE.md prescribes — don't improvise a different process:

- Read the issue's **acceptance criteria** and its **Governing ADRs**; build to the ADRs, not assumptions.
- Implement **test-first** (red → green), one behavior at a time — the `tdd` skill is the method.
- Verify green before considering it done: run the project's **test** and **typecheck** commands
  (see the root README / package.json scripts).
- Respect the architecture and dependency rules declared in `docs/architecture.md`.

## Guardrails

- **ADR wins.** If an issue is ambiguous or conflicts with an ADR, **stop, comment on the issue**
  explaining the blocker, and move to the next unblocked one — never guess or invent scope.
- **Never** run tests or writes against **production data stores** — tests use local throwaway databases only.
- Never commit secrets. Get every domain specific from the ADRs / CONTEXT.md, not memory.
- One issue at a time; don't batch.
