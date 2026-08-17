A member with a generated spec and an empty build list can derive the project's first set of build units from that spec in one action, instead of typing twenty units by hand. This closes the asymmetry `41` created: the change path produces units automatically while the initial path never did.

## Implementation

1. `lib/unit-agent/payload.ts` — every schema this path is validated with.
   - The client request: `roomId` only. Nothing else travels in the body — not the spec, not the spec id, not the unit list. The task reads all of them server-side from the project the access check resolved, the rule `POST /api/ai/change` already follows.
   - The task payload: `projectId` and `specId`, both resolved server-side by the route.
   - The model's return object: a list of units, each a `title` and an optional `summary`.
   - Bound what the model may return with a runaway guard in the spirit of `MAX_BUILD_UNITS` — a spec does not imply eighty units, and a model that returns eighty is malfunctioning.
   - Live in `lib/` and not in the task module, so the route can validate against the same schema without importing the task instance into the request bundle.

2. `lib/unit-agent/derive.ts` — the context load, the prompt, and the one model call.
   - Read the spec's Markdown server-side through the existing storage helper, plus the project's existing units as `key` + title, so the prompt can say what already exists.
   - Its own `UNIT_MODEL` constant, never `SPEC_MODEL` or `CHANGE_MODEL`. Naming it separately is what lets the three be raised independently.
   - Return the object through `generateObject`, not `generateText`. A build list has to be acted on, so it must arrive validated rather than as prose to parse — the same departure `40` made and for the same reason.
   - The prompt states that units are ordered pieces of work, that each is a coherent increment, and that the units already listed must not be repeated.

3. `lib/unit-agent/produce.ts` — the producer, in one transaction.
   - **`38`'s producer contract, unchanged: match on `key`, add what does not exist, never touch the rest.** Reuse `deriveBuildUnitKey`; do not write a second key derivation.
   - Follow `lib/changes/apply.ts`'s transaction ordering exactly, and for the same reasons: reserve the whole sequence block in **one** increment of N, read the existing key set while that lock is held, check the cap against what will *actually* be created after collisions are removed, then insert from the front of the reserved block. Numbers reserved for skipped units go unused and the gap is correct.
   - Write `source: SPEC` and `specId` on every created row. **No migration:** both columns already exist and `BuildUnitSource.SPEC` was reserved for this producer.
   - `status`, `verified`, and `sequence` are human-owned. `status` and `verified` take their defaults here and never a value the model returned; nothing this unit writes may set them from model output.
   - It **only adds**. It never supersedes, never deletes, and never edits an existing unit — supersession requires a change to point at, and a derivation has no change.
   - Refuse the cap **whole**: nothing created.
   - Return what was created and the titles that were skipped, so the caller can report what did not land.

4. `trigger/derive-units.ts` — the durable task, shaped like `trigger/propose-change.ts`.
   - Re-check the refusals inside the task, because the project can move between the route's check and the run.
   - Progress rides on the **run's own metadata**, not `ai-status-feed`: a build list is not a shared realtime document, so this follows the spec and proposal path rather than the design agent's broadcast path.
   - Every refusal is an `AbortTaskRunError` — none of them becomes true by waiting. Quota exhaustion goes through the existing `isQuotaExhaustedError`.

5. `app/api/ai/units/route.ts` and `app/api/ai/units/token/route.ts` — mirroring `app/api/ai/change/`.
   - Resolve access from the authenticated user and `roomId` alone, then pass the resolved `project.id` onward. Do not accept a `projectId` or a `specId` from the body: a route that access-checks one id and acts on another is the bug.
   - **Refuse a project with no spec before the run is triggered** — a request that cannot succeed must never spend a model call, the discipline `40` set.
   - Record the `TaskRun` against the resolved project id, and issue a realtime token only to the user the run belongs to.

6. `scripts/verify-units-from-spec.ts` plus a `verify:units` npm alias, added to `verify:db`.
   - Phases: `derive` (the producer against hand-authored input), `guard` (the no-spec and cap refusals), `contract` (the human-owned columns are untouched and an existing unit is not rewritten), and `idempotent` (deriving twice creates nothing the second time).

## Dependencies

Already installed: `@trigger.dev/sdk`, `ai`, `@ai-sdk/openai`, `zod`, `@prisma/client`.

To install: nothing.

`OPENAI_API_KEY` already exists in `.env.local` and is the standing ops item for the Trigger.dev environment. No new env var.

## Scope Limits

- do not add a column or a migration — `specId` and `BuildUnitSource.SPEC` already exist for this
- do not derive units automatically when a spec is generated; this is an explicit action, for the reason `43` gives about not auto-pushing on apply
- do not write `status`, `verified`, or `sequence` from anything the model returned
- do not supersede, edit, or delete an existing unit
- do not add a second key derivation, a second model constant for an existing path, or a second slugifier
- do not build the UI control — that is a later unit (see Notes)
- do not change how `POST /api/ai/change` or `lib/changes/apply.ts` behave

## Notes

- Read `context/architecture-context.md` — `## Build Units`, `## Applying A Change`, and `## Canvas Write-Back` — before implementing. The producer contract is stated there in full.
- Follow `lib/changes/apply.ts` for the transaction, `trigger/propose-change.ts` for the task, and `app/api/ai/change/route.ts` for the routes.
- **The UI is deliberately a separate unit**, per `ai-workflow-rules.md`'s rule against combining UI and background-task changes in one step. The spec path was split the same way across `27` (backend), `28` (persistence), and `29` (UI).

## Check When Done

- Deriving against a project with a spec and an empty build list creates units with `source: spec` and the spec's version as their lineage.
- Deriving a second time from the same spec creates nothing: every derived key already exists.
- A derived unit whose key collides with a hand-typed unit is skipped and reported, and the existing unit is byte-unchanged.
- Every created unit reads `specced` / `none`, whatever the model returned.
- No existing unit's `status`, `verified`, `sequence`, `title`, or `summary` changes.
- A project with no spec is refused before a model call is made.
- A derivation that would exceed `MAX_BUILD_UNITS` is refused whole — nothing created.
- `npm run verify:units -- all` passes, and `npm run verify:db` still passes in full.
- `npm run build` passes without type errors.
