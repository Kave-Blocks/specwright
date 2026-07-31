A member describes a change in plain English against a project that already has a spec, and Specwright returns a **proposal**: what shifts in the architecture, which existing build units the change makes stale, and what new work it implies. It applies nothing — accepting a proposal is unit `41`.

## Implementation

Units `38` and `39` must be shipped first — this unit reads build units and requires a project to have a versioned spec.

1. `prisma/models/project.prisma` — the change counter.
   - Add `nextChangeSequence Int @default(1)` and the `changes ProjectChange[]` back-relation.
   - This is the third counter on `Project`, after `nextBuildUnitSequence` (`38`) and `nextSpecVersion` (`39`). Doc-comment that it is deliberately the same pattern a third time rather than three patterns: `max(n) + 1` is wrong for all three for the identical concurrency reason `38` already wrote down.

2. `prisma/models/project-change.prisma` — the new models and enum.
   - `ProjectChange`: `id` (cuid), `projectId`, `sequence` (Int), `request` (String — the member's own words), `status`, `baseSpecId`, `proposalPath` (String, optional — the blob URL, set once the run stores the proposal), `authorId` (Clerk user id), `createdAt`, `updatedAt`.
   - `ChangeStatus`, SCREAMING_SNAKE like `ProjectStatus` and `BuildUnitStatus`: `PROPOSED`, `APPLIED`, `DISCARDED`, default `PROPOSED`. All three members are defined here even though this unit only ever writes `PROPOSED` and `DISCARDED` — an enum member is vocabulary, not an anticipated relationship, and splitting one across units buys a second migration for nothing. `41` implements the `APPLIED` transition.
   - `baseSpecId` relates to `ProjectSpec` with `onDelete: Restrict`. It records **which spec version the proposal was reasoned against**, and it is the whole basis of `41`'s staleness check — a proposal whose base silently vanished cannot be judged.
   - `ProjectChangeImpact`: `id`, `changeId`, `buildUnitId`, `reason` (String). One row per existing unit the change affects. `@@unique([changeId, buildUnitId])`.
   - Impact rows reference a unit by **`buildUnitId`, never by `key`** — `38` re-derives a unit's key when its title changes, so a key is not stable across a rename. Doc-comment this; it is the kind of thing a later change would quietly get wrong.
   - Both relations cascade from their parent (`ProjectChange` from `Project`, `ProjectChangeImpact` from both `ProjectChange` and `ProjectBuildUnit`), so deleting a unit removes the impact rows pointing at it rather than leaving a dangling reference.
   - Generate and apply the migration, with the `05-prisma.md` fallback if the shadow-database step fails.

3. `types/changes.ts` — the wire contract, client-safe.
   - String-union types for the change status, using the lowercase vocabulary on the wire (`"proposed"`, `"applied"`, `"discarded"`) as `types/build-units.ts` does for its own enums.
   - `ChangeSummary` — `id`, `sequence`, `request`, `status`, `baseSpecVersion`, `createdAt`. **`baseSpecId` and `proposalPath` are not included**: one is a server-side matching detail and the other a private blob URL, which is never returned to a client.
   - `ChangeProposal` — the document shape a client renders: `summary`, `architectureDelta`, `affectedUnits`, `proposedUnits`, `openQuestions`.
   - `ChangeListResponse`, plus ordered display metadata for the status vocabulary (value → label → token class), so the UI has one source for order, wording, and color.
   - This module must import nothing from `lib/` or from the generated Prisma client, for the reason `types/specs.ts` states at the top of the file.

4. `lib/change-agent/payload.ts` — the request and proposal schemas.
   - The request schema follows `lib/spec-agent/payload.ts` exactly: `roomId` (trimmed, non-empty) and the change `request` text. **`projectId` is deliberately absent** — the room id is the project id and access is resolved server-side, as that file's doc comment explains.
   - Bound `request` by **truncating, not rejecting** — it is human-typed into a control with no `maxlength`, the policy `MAX_BRIEF_LENGTH` documents for exactly that case.
   - The **proposal schema** is the structured shape the model must return: a `summary` string, an `architectureDelta` array of `{ kind: "added" | "modified" | "removed", component, detail }`, an `affectedUnits` array of `{ key, reason }`, a `proposedUnits` array of `{ title, summary }`, and an `openQuestions` array of strings.
   - Cap every array — `MAX_DELTA_ENTRIES`, `MAX_AFFECTED_UNITS`, `MAX_PROPOSED_UNITS`, `MAX_OPEN_QUESTIONS`. These are runaway guards in the spirit of `MAX_NODES` and `38`'s 200-unit cap, not product limits.
   - Export the payload schema the task validates with (the request plus the server-resolved `projectId`), so the route validates against the same schema without importing the task.

5. `lib/change-agent/propose.ts` — the model call.
   - Use **`generateObject`** from `ai`, not `generateText`. The spec path returns prose because a spec *is* prose; a proposal has to be acted on by `41`, so it must come back as a validated object. This is the one substantive departure from the existing AI path.
   - Its own model constant, `CHANGE_MODEL` — do not reuse `SPEC_MODEL`. Reasoning over an existing spec plus a live unit list is a harder task than writing prose, and the two must be raisable independently.
   - Input to the model: the change request, the current spec's Markdown, the project's `architectureBrief`, the canvas graph, and the project's build units as `key` + title + summary + status. All read server-side from the already access-checked `projectId` — never accepted from the request body, the same rule `36` established for the brief.
   - The system prompt tells the model to express the architecture delta **as a delta** — what is added, modified, and removed — rather than restating the whole system. It references existing units by the `key` values it was given, and is told plainly that it must not invent a key.
   - Throw when the model returns nothing usable, matching `generateSpecMarkdown`'s behavior.

6. `lib/change-agent/validate.ts` — trust nothing the model returned.
   - Resolve every `affectedUnits[].key` against the project's actual units. **A key that does not resolve is dropped, never stored.** Model output is unknown external input at a system boundary and `context/code-standards.md` requires it to be validated before it is trusted — a hallucinated unit reference must not reach the response.
   - Return both the resolved impact rows (as unit ids) and a count of how many entries were dropped, so the run can log it. A model that frequently invents keys is a prompt problem, and it is invisible unless it is counted.
   - Normalize proposed unit titles and summaries the way `38`'s `lib/build-units.ts` does on the way in: trim, drop an empty title, truncate over-length text.

7. `lib/change-agent/storage.ts` — persist the proposal.
   - Upload the validated proposal document as JSON to Vercel Blob at `changes/{projectId}/{changeId}.json`, mirroring `specs/{projectId}/{specId}.md`. The store is private; the URL is never handed to a client.
   - Mint the change id up front so one id names both the object and the row, exactly as `saveProjectSpec` does and for the same reason.
   - Write the `ProjectChange` row and its `ProjectChangeImpact` rows in **one transaction**, after the upload succeeds, so a failed upload leaves no row pointing at a missing artifact.
   - The sequence comes from incrementing `Project.nextChangeSequence` inside that transaction.

8. `trigger/propose-change.ts` — the durable task.
   - A `schemaTask` validated by the payload schema from step 4, following the shape of `trigger/generate-spec.ts`.
   - Publish progress on the **run's own metadata**, not on a room feed, reusing the existing `AiStatusPhase` vocabulary. `context/architecture-context.md` draws this line: design generation broadcasts to `ai-status-feed` because it mutates the shared canvas, while work produced for the requester rides on the run. A proposal mutates nothing shared, so it follows the spec path.
   - Publish the resulting `changeId` on the metadata once stored — never the blob URL.
   - **Reuse `lib/ai-errors.ts`**: `isQuotaExhaustedError` plus `AbortTaskRunError` and `QUOTA_EXHAUSTED_MESSAGE`, and gate the `error` phase on `isTerminalFailure` exactly as `generate-spec` does. A third AI task must adopt `37`'s classification rather than reinvent it — this is precisely where "Please try again" creeps back in.

9. `app/api/ai/change/route.ts` — trigger a proposal.
   - Validate the body, resolve project access from the authenticated user and `roomId`, then trigger the task and record a `TaskRun`, following `POST /api/ai/spec`.
   - **Refuse before spending a model call** when the project has no spec: answer 409 with a message a person can act on. A change is a delta against something, and there is nothing to delta against.
   - Reuse the existing run-scoped realtime token route rather than adding a second one — `TaskRun` carries run id, project id, and user id and is task-agnostic. If it turns out to be spec-specific, generalise it in place rather than duplicating it.

10. `app/api/projects/[projectId]/changes/route.ts` — the collection.
    - `GET` lists the project's changes newest-first, metadata only, joining each change's `baseSpec.version` so the client can show what it was reasoned against.
    - `withProjectMember` — changes are project *content*, like the canvas, the brief, and build units, not project *lifecycle*. The reasoning is already written out in the brief route's doc comment.
    - Query by the `project.id` the guard resolved, never the raw path param.

11. `app/api/projects/[projectId]/changes/[changeId]/route.ts` — one change.
    - `GET` returns the change plus its stored proposal document, dereferencing the blob behind the access check — the same shape the spec download route uses, and the only way a client reads proposal content.
    - `DELETE` discards a change: set `status` to `DISCARDED`. It does **not** remove the row — a proposal someone considered and rejected is a decision worth keeping.
    - Both scope the read and write to `{ id: changeId, projectId }` and answer 404 when nothing matched, the row-scoping pattern that stops a change id from another project being reachable through a project the caller does belong to.

12. `hooks/use-project-changes.ts` — the client data hook.
    - Model it on `hooks/use-project-specs.ts`: plain `fetch` with an `AbortController`, a reload key, a request counter that ignores a superseded response, no shared state.
    - Beyond `changes` / `isLoading` / `error` / `refresh`, expose `propose` and `discard`.

13. `components/editor/changes/changes-view.tsx` — the Changes surface (`"use client"`).
    - A centered column: a request box at the top, then the project's changes newest-first. Selecting one expands it to show the proposal — the summary, the architecture delta grouped by kind, the affected units by title, the proposed new units, and any open questions.
    - Track a live run with the existing realtime run hook, exactly as the Specs view tracks spec generation, and settle to the run's published text on failure rather than overwriting it with a local constant — the regression `37` fixed.
    - Loading, error, and empty states follow `components/editor/specs/specs-view.tsx`.

14. `app/editor/[roomId]/changes/page.tsx` — the route.
    - A Server Component that awaits `params` and renders the view with `projectId`, the shape of `app/editor/[roomId]/specs/page.tsx`. The access gate and room connection live in the shared layout.

15. `components/editor/workspace-navbar.tsx` — reach it from the mode-switcher.
    - Add `Changes` as the sixth and last entry.
    - `38` records that the switcher has **no wrap or scroll handling** and that "Architecture Interview" is already the long label. Six entries is where that stops being survivable, so this unit is responsible for making the switcher handle its own overflow. Do not solve it by shortening or removing an existing label.

16. `app/editor/[roomId]/page.tsx` and `components/editor/home/project-home-view.tsx` — the Home card.
    - Count the project's changes awaiting a decision, and add a Changes `ModeCard` as the fifth card, moving `PlannedModeCard` to sixth.
    - **Do not reuse the placeholder slot** — it names Research Fleet, a deferred product direction recorded in that component and in `context/ui-context.md`.
    - Status line: "No changes yet" when empty, otherwise "{n} awaiting review", with the singular/plural care the Specs card takes.

17. Update `context/architecture-context.md` (change proposals under the storage model and the AI generation model, plus the new routes under the membership-gated group), `context/ui-context.md` (the Changes route, the switcher's overflow handling, and Home going to six cards), and `context/project-overview.md` (Changes in the core user flow and a Features entry).

## Dependencies

Already installed:

- `ai` 7.0.19 — `generateObject` comes from the same package `generateText` already does
- `zod` 4.4.3, `@ai-sdk/openai` 4.0.11
- `@trigger.dev/sdk`, `@vercel/blob`, `prisma` / `@prisma/client` 7.8, `next` 16.2.10, `@clerk/nextjs`

To install:

- nothing

`OPENAI_API_KEY` is required and already exists. It must also be present in the Trigger.dev environment — task env is not loaded from Next's `.env.local` (see the ops note in `context/progress-tracker.md`).

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- **Delta kinds** (added / modified / removed) use the muted badge treatment `38` established for collapsed-row badges. Do not introduce a green/red diff palette — there is no such pair in the token set, and adding one is a design decision this unit has no mandate for.
- **Status chips** use the established three states: selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated`.
- Radius scale: `rounded-2xl` for change cards, `rounded-xl` for the request box and inline controls.
- The view root must carry `pl-(--canvas-inset-left,0px)` with `transition-[padding-left] duration-200 ease-out`, like Project Home, Discovery, Specs, and Build — without it the floating project sidebar renders on top of the content (the bug fixed on 2026-07-29).
- Component states to cover: request box (default, empty-disabled submit, pending), run (start, processing, complete, error), change row (rest, hover, expanded), list (loading, error, empty). The error state is `role="alert"` in `text-error`.

## Scope Limits

- do not create, update, or delete any build unit
- do not write a `ProjectSpec` row or generate spec Markdown
- do not mutate the canvas or write anything to the Liveblocks room
- do not publish to `ai-status-feed` or add any second realtime channel
- do not implement the `APPLIED` transition — that is unit `41`
- do not trust a model-returned unit key without resolving it against the project's actual units
- do not detect drift between a spec and any codebase
- do not reimplement quota classification — reuse `lib/ai-errors.ts`
- do not accept `projectId`, the spec, the brief, or the unit list from the request body
- do not return `proposalPath`, `baseSpecId`, or any blob URL to a client
- do not reuse `SPEC_MODEL` or change the spec-generation prompt
- do not reuse the Research Fleet placeholder card's slot

## Notes

- Read `context/architecture-context.md` and `context/code-standards.md` before implementing; `context/ui-context.md` for the chip, badge, and layout tokens.
- `trigger/generate-spec.ts` is the reference task: phase publishing, terminal-failure gating, quota handling, and persisting from inside the task rather than a request handler.
- `lib/spec-agent/payload.ts` is the reference for bounding untrusted input, and for why the schema lives in `lib/` rather than in the task module.
- The delta shape (added / modified / removed against the current spec, rather than a rewritten document) follows OpenSpec's model, which the landscape research in `context/context-improvment.md` found to be the cleanest precedent available.
- Server Components by default; `"use client"` only on the view that needs interactivity.

## Check When Done

These do not need a working model call:

- A member of a project with no spec who submits a change gets a clear refusal, and no run is started.
- A member of a project with a spec can submit a change and a run starts.
- Two members submitting a change at the same moment receive different change numbers.
- The Build page is **identical before and after** a proposal — same units, same order, same statuses, same verification levels.
- The canvas is unchanged, and no message appears on `ai-status-feed` or `ai-chat`.
- Discarding a change sets its status to discarded and leaves the row and its proposal in place.
- A change id belonging to a different project cannot be read or discarded through a project the caller does belong to.
- A signed-out caller and a non-member get no data and no confirmation the project exists.
- Deleting a build unit that a change references leaves the change readable, with that impact entry gone.
- Deleting a project removes its changes.
- No response from any changes route contains `proposalPath`, `baseSpecId`, or a blob URL.
- The mode-switcher shows six entries without clipping or overlapping at the narrowest supported width.

These require the OpenAI quota to be restored:

- A submitted change returns a proposal naming real components from the current spec and real units by their actual titles.
- A proposal that references a unit key which does not exist in the project drops that entry rather than surfacing it.
- The change records the spec version it was reasoned against, and that version is shown alongside it.
- A spent quota fails on the first attempt with the quota message, not "Please try again".

- `npm run build` passes without type errors.
