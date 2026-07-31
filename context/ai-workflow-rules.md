# Development Workflow

## Approach

Build this project incrementally using a spec-driven workflow. Context files define what to build, how to build it, and what the current state of progress is. Always implement against these specs — do not infer or invent behavior from scratch.

## Spec Structure

Every file in `context/feature-specs/` follows the structure defined in `context/feature-specs/_TEMPLATE.md`. Read it before writing a new spec.

Required sections: a summary, `## Implementation`, `## Scope Limits`, and `## Check When Done`. `## Dependencies`, `## UI Details`, and `## Notes` are added only when the unit calls for them.

Specs describe behavior, not code. Every `## Check When Done` line must be independently verifiable, and the last one is always the build check.

## Scoping Rules

- Work on one feature unit or subsystem at a time.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries in a single implementation step.

## When To Split Work

Split an implementation step if it combines:

- UI changes and background task changes
- Real-time canvas state and database persistence
- Multiple unrelated API routes
- Behavior that is not clearly defined in the context files

If a change cannot be verified end to end quickly, the scope is too broad — split it.

## Handling Missing Requirements

- Do not invent product behavior that is not defined in the context files.
- If a requirement is ambiguous, resolve it in the relevant context file before implementing.
- If a requirement is missing, add it as an open question in `progress-tracker.md` before continuing.

## Protected Foundation Components

Do not modify generated third-party foundation components unless explicitly instructed.

This includes:

- `components/ui/*` (shadcn/ui components)
- third-party library internals

These should remain default and reusable.

Project-specific styling, layout changes, and feature logic must be implemented in app-level components instead of modifying foundation components.

Only modify these files when a task explicitly requires it.

## Keeping Docs In Sync

Update the relevant context file whenever implementation changes:

- System architecture or boundaries
- Storage model decisions
- Code conventions or standards
- Feature scope

Progress state must reflect the actual state of the implementation, not the intended state.

### Recording Progress

Every unit of work gets its own file under `context/progress/`, never a new paragraph in `progress-tracker.md` itself:

- A unit with a feature spec: `context/progress/NN-name.md`, same number and name as its `context/feature-specs/NN-name.md`. Include what was built, what deviated from the spec and why, what was verified and how, and what was left undone.
- A later fix or QA follow-up against a unit that already shipped goes into that *same* file as a new `### Follow-up — YYYY-MM-DD` section. A follow-up that doesn't belong to one unit (spans several, or isn't spec-driven work) gets its own `context/progress/YYYY-MM-DD-short-slug.md` instead.
- `progress-tracker.md` never grows a per-unit paragraph again. Add or update that unit's one row in `## Unit Index` — edit in place, never append a second row for the same unit.
- `## Current Phase` holds only work genuinely in flight. The moment a unit ships, delete its bullet there.

`context/progress/_TEMPLATE.md` documents the naming rule, the Follow-up convention, and the `Status`/`Verified` vocabularies used by the index.

### Deferring A Check To A Person

A check that genuinely needs a human step — a second account, a real payment, a physical device — goes in `context/qa/<slug>.md` rather than being written off in a progress file's "not verified" list. See `context/qa/README.md` for the file shape. Two rules: the unit's `Verified` level does **not** improve because a check was filed, and the file is deleted once the check runs and its result lands in the owning unit's progress file.

## Before Moving To The Next Unit

1. The current unit works end to end within its defined scope.
2. No invariant defined in `architecture-context.md` was violated.
3. `context/progress/NN-name.md` records the completed work, and the unit's `## Unit Index` row in `progress-tracker.md` is updated in place.
