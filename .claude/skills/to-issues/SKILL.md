---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices.
disable-model-invocation: true
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker is **GitHub Issues** (use `gh`). Triage labels: `ready-for-agent` (fully specified, safe for an autonomous agent to pick up) and `tracer-bullet` (a thin vertical slice).

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

<vertical-slice-rules>

- Each slice delivers a narrow but COMPLETE path from the data layer up to the project's **delivery boundary** — the outermost surface a consumer touches. Read the boundary from `docs/architecture.md` ("Delivery boundary:"); it is project-specific — an HTTP endpoint for a service, an exported function for a library, a command for a CLI, a screen for an app. Do NOT assume "API + UI"; use whatever that project declared.
- A completed slice is demoable or verifiable **at the delivery boundary** on its own — not merely as a tested internal function below it.
- **Screen-touching slices carry a visual contract.** If the slice includes a screen, its acceptance criteria MUST include a visual-conformance checkbox (e.g. "matches the visual reference declared in `docs/design.md` and its conventions") — prose references are advisory; **only checkboxes bind**. Its References section MUST link that **specific visual reference** (the reference screen, or a design frame if the project uses one), not just the whole design doc.
- ⚠️ **Watch for a PRD whose test seam sits below the delivery boundary** (e.g. all acceptance is "the pure engine returns X"). That describes only the bottom of the slice. Extend the slice UP to the delivery boundary — the acceptance criteria must name the consumer-facing surface (e.g. "POST /trades persists and returns X"), not just the internal function. The lone exception is when the delivery boundary genuinely IS that function (a pure library) — then stopping there is complete.
- Any prefactoring should be done first

</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?

Before presenting, run a **completeness check**: does every slice reach the delivery boundary declared in `docs/architecture.md`? If any slice stops at an internal layer (pure logic only, no consumer-facing surface) — and that layer is not itself the declared boundary — flag it and extend it up before listing it. Call out anything the PRD left in the gap between its test seam and the delivery boundary.

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. These issues are considered ready for AFK agents, so publish them with the correct triage label unless instructed otherwise.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

Each issue must be **self-sufficient** — its acceptance criteria + governing ADRs + (for screens) the visual reference are everything an agent needs. Issues cite **ADRs, never the PRD**: the PRD is ephemeral scaffolding. If an issue can't be understood without the PRD, it is under-specified — fix the issue, don't lean on the PRD.

**After all issues are published, delete the source PRD** (`docs/prd/current.md`) — its job is done and it is rebuildable via `/to-prd`. This keeps exactly zero stale PRDs around.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

## References

- **Project map:** CLAUDE.md — read first; points to all docs.
- **Governing ADRs** for this slice (link each).
- For screen slices: the **visual reference declared in `docs/design.md`** (reference screen or design frame).

</issue-template>

Do NOT close or modify any parent issue.