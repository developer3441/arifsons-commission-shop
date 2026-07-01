---
name: to-prd
description: Turn the current docs adr and glossary into a PRD and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the PRD, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to **test** the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

   ⚠️ **A test seam is NOT the delivery boundary.** The test seam is *where you assert behaviour* (often a pure function). The **delivery boundary** is the outermost surface a *consumer* of this system actually touches — read it from `docs/architecture.md` ("Delivery boundary:"). It is project-specific: an HTTP API for a service, the exported functions for a library, the commands for a CLI, the screens for an app. A low, pure-function test seam is good for *testing*, but the feature is not delivered until it reaches the delivery boundary. Name that boundary in the PRD so slices reach it — never let a low test seam silently become the deliverable.

Check with the user that these seams **and the delivery boundary** match their expectations.

3. Write the PRD using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- **Delivery boundary** — the outermost surface this feature ships to (from `docs/architecture.md`): which endpoints / exported functions / commands / screens a consumer will use. State it explicitly so every slice reaches it.
- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD. **Be explicit about the delivery boundary:** if any consumer-facing surface (the API, exports, CLI, or UI) is deliberately deferred, say so here by name. Silence is a bug — a layer that is neither in scope nor out becomes nobody's job and never gets an issue.

## Further Notes

Any further notes about the feature.

</prd-template>