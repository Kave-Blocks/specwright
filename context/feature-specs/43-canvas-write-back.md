Applying a change updates the build list and leaves the canvas untouched. The canvas is what specs are generated from, so every applied change is invisible to the next spec — regenerate one today and it silently describes a system without any of the work the changes added. This unit pushes an applied change onto the canvas **through the existing design path**, so the loop closes.

Unit `41` closed the write half of the change loop and `42` made the resulting gap countable. Neither could close it: `42` can only tell a person the spec is behind, and the instruction it gives them — put the change on the canvas yourself — is manual work the system already has the pieces to do. This unit turns that instruction into an action, and only then does `42`'s notice become able to say "regenerate".

**This is the last structurally broken link in the loop.** Until it ships, the honest description of Specwright is that applying a change degrades the project's own source of truth.

## Implementation

Units `40`, `41`, and `42` must be shipped first.

1. `prisma/models/project-change.prisma` — one nullable column, `canvasPushedAt DateTime?`.
   - It records **when this change's architecture delta was written onto the canvas**, and nothing else records it. The canvas is a CRDT document with no memory of which change produced which node, so unlike `42`'s drift this is genuinely not derivable — there are no two existing numbers that already say it.
   - State that contrast in the doc comment. `42` refused a column for a fact two columns already implied; this one is the opposite case, and the rule (`39`: add a column that records a fact already true, not one that anticipates a relationship) is what decides both. A push is an event that happened.
   - `null` means "not pushed", which is also the retry state: a failed push leaves it null and the action stays available.
   - Purely additive migration. Generate and apply it with the `05-prisma.md` fallback if the shadow-database step fails.

2. `lib/canvas-sync/plan.ts` — turn an architecture delta into a design prompt.
   - One function that takes the change's `architectureDelta` plus its `summary`, and composes the prompt string `generateDesignPlan` already accepts. **No new model call site and no second design model** — this reuses `lib/design-agent/plan.ts` wholesale, which is what "through the existing design path" means. `DESIGN_MODEL` stays the one place the model is named.
   - Only `added` and `modified` entries reach the prompt. Removals are excluded here, not filtered later — see step 3.
   - The prompt must tell the model it is **extending an existing diagram**, not drawing a new one, and that the node ids already on the canvas are the ones it may attach edges to. `generateDesignPlan` already passes the current canvas as `current`; this prompt has to make the *intent* additive, because the same function is used for freeform design where replacing the graph is legitimate.

3. `lib/canvas-sync/plan.ts` — the destructive-operation filter, enforced in code.
   - After the plan comes back, **drop every `deleteNode` and `deleteEdge` operation before it reaches `applyDesignPlan`.** Count the drops and return them.
   - This is a filter, not a prompt instruction, and that is the whole point: a prompt is a wish, and unit `40` already records that this model invents identifiers it was never given. A hallucinated `deleteNode` would remove a node a person drew, along with `applyDesignPlan`'s cascade of its edges. The one thing this unit must never do is destroy canvas work in order to record a change.
   - `moveNode` and `resizeNode` are also dropped. They rearrange a shared document that people have laid out by hand, and nothing in a delta justifies it.
   - Allowed: `addNode`, `updateNode`, `addEdge`. Nothing else.

4. **`removed` deltas are reported, never drawn.** This is a deliberate limit, not an oversight.
   - There is no honest way to render "retired" in this palette. `red` means *something went wrong* (`ui-context.md`), and a planned removal is not an error; `neutral` is the default fill, so it says nothing. Inventing a third tone for one surface is a design decision with no mandate — the same call `40` made in refusing to colour-code delta kinds and `41` made in refusing a warning colour for its stale notice.
   - Deleting the node instead is the one thing the project's core value forbids: `41` exists because a record of what was built must survive being replaced, and a canvas node is that record in visual form.
   - So removals travel to the UI as a list, and a person removes them on the canvas with full context. Say so in the outcome rather than staying silent, or the canvas quietly overstates the system.

5. `trigger/canvas-sync.ts` — the durable task.
   - Payload: `{ projectId, changeId, roomId }`. Load the change, refuse anything that is not `APPLIED`, and refuse one whose `canvasPushedAt` is already set.
   - Read the current canvas with a read-only `mutateFlow`, compose the prompt, call `generateDesignPlan`, filter the operations, then apply with `applyDesignPlan` inside a second `mutateFlow` — exactly the shape `trigger/design-agent.ts` already has.
   - Progress rides on the shared **`ai-status-feed`**, not the run's own metadata. This mutates the canvas everyone in the room is looking at, so it follows the design agent's broadcast path rather than the spec path; a spec is written for the person who asked, a canvas change happens to everybody. Reuse `announce` and the AI presence handling rather than restating them.
   - Set `canvasPushedAt` **only after the mutation succeeds**. A push that failed halfway must stay retriable, and a CRDT write is not transactional with Postgres — which is exactly why this is a task and not part of `41`'s transaction.
   - Quota exhaustion is `AbortTaskRunError` via `isQuotaExhaustedError`, the same classification `37` established. Do not restate the reasoning; call the existing helper.

6. `app/api/ai/canvas/route.ts` and `app/api/ai/canvas/token/route.ts` — trigger and run-scoped token.
   - Mirror `app/api/ai/design/` exactly: validate the body, resolve the project through `getAccessibleProject`, trigger the task, write the `TaskRun` row, return the run id; the token route mints the run-scoped read token.
   - `projectId` arrives **in the body, not the path**, matching the design route's convention for room-scoped AI work.
   - Refuse a change that is not `APPLIED`, or one already pushed, with a 409 that says which — before the run is triggered and a model call is spent. `40` established that a refusable request is refused before the quota is burned.

7. `types/changes.ts` — the wire contract.
   - `ChangeSummary` gains whether the change has been pushed to the canvas. A **boolean, not the timestamp**: the UI renders a control's availability, not a date, and `39`'s discipline is to send only what the client renders.
   - The push outcome carries what landed — nodes added, nodes updated, edges added — plus the **skipped removals by component name**, so the view can name them.

8. `components/editor/changes/changes-view.tsx` — offer it where the drift is created.
   - `41`'s apply outcome gains the control. This is the moment the canvas falls behind, so it is the moment to fix it, and `42` already put the explanation here.
   - An `APPLIED` change that has not been pushed offers the same control in its expanded body, so a change applied before this unit shipped is not stranded.
   - After it runs, report what landed and **list the removals that were not drawn**, with the reason in one line. A person who is not told will assume the canvas is now complete.
   - A pushed change says so and offers nothing further. There is no re-push: the delta has been drawn, and drawing it twice duplicates nodes.

9. `components/editor/specs/specs-view.tsx` — `42`'s notice can finally tell the truth.
   - The drift notice currently says the change has to reach the canvas **manually**, because that was true. Once a change can be pushed, the honest instruction changes: push any unpushed changes, then regenerate.
   - When every applied change since the current spec has been pushed, the notice becomes what `42`'s spec originally wanted it to be — regenerating now genuinely does bring the spec up to date, so it may finally say so.
   - When some are unpushed, it must still say which step comes first. Do not collapse the two states into one message; the whole failure `42` recorded is a notice that invites an action which silently does not work.

10. Update `context/architecture-context.md` (a `## Canvas Write-Back` section: why it is a task and not part of `41`'s transaction, the operation filter as a harness rather than a prompt, and removals as reported-not-drawn) and `context/ui-context.md` (the control on the apply outcome, and `42`'s notice gaining a second state).

## Dependencies

Already installed:

- `@liveblocks/react-flow` (`mutateFlow`), `@trigger.dev/sdk`, `ai` + `@ai-sdk/openai`, `prisma` / `@prisma/client` 7.8

To install:

- nothing

No new environment variables. **This unit makes one model call**, through `generateDesignPlan` — the existing design path, the existing `DESIGN_MODEL`. It does not add a second model, a second provider, or a second prompt-building module for canvas work.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- The push control takes the **secondary** treatment, not the primary: `41`'s Apply is the primary action on that panel and stays so. This is the follow-on step, not a competing one.
- Its outcome reuses the neutral `rounded-xl border border-surface-border bg-base` well `41` and `42` both use — `role="status"`, never `alert`. Nothing here fails when a removal is skipped; it is the designed behaviour.
- The skipped-removal list follows the shape `41`'s skipped-titles list already has: a short line of explanation, then the component names as items. Do not invent a second list treatment.
- While the run is in flight the control is disabled and says so. The canvas is mutating live under the person's eyes, which is the design agent's existing behaviour and needs no new affordance.
- Component states to cover: applied-and-unpushed, running, pushed, failed-and-retriable, and an outcome with removals versus one without.

## Scope Limits

- do not delete, move, or resize anything on the canvas, under any circumstance
- do not draw `removed` deltas — report them
- do not add anything to `41`'s transaction, or change what it writes
- do not regenerate a spec, here or anywhere; that stays the existing unit `27` path behind its existing control
- do not change `42`'s counting rule — drift is still measured from spec versions, and pushing to the canvas does not clear it. Only generating a spec does, and that is correct: the spec really is still behind until it is rewritten
- do not auto-push on apply. The canvas is collaborative and a click that said "Apply" must not silently rewrite a shared drawing
- do not allow a second push of the same change
- do not add a second design model, prompt module, or status feed

## Notes

- Read `context/architecture-context.md` (AI Generation Model, Applying A Change, Spec Drift) and `context/code-standards.md` before implementing; `lib/design-agent/apply.ts` for the operation vocabulary and its existing defensive skips.
- `applyDesignPlan` already skips dangling and invalid operations and returns an `AppliedSummary`. Do not add a second layer of validation for what it already handles — the filter in step 3 exists for a different reason (it removes operations that are *valid* and would succeed).
- The open question this closes is the second one in `progress-tracker.md`, raised to blocking by `42` on 2026-08-16. Close it there when this ships.
- This unit is why `41` deliberately wrote no spec and touched no room. Neither was an omission; both were waiting for this.

## Check When Done

- Applying a change, then pushing it, adds the delta's new components to the canvas as nodes, connected to the nodes they relate to.
- A `removed` delta draws nothing, and the outcome names the component that was not drawn.
- A plan containing `deleteNode`, `deleteEdge`, `moveNode`, or `resizeNode` has those operations dropped before anything is applied — verified by feeding a hand-authored plan through the filter, not by hoping the model does not emit them.
- No node or edge that existed before a push is missing after it.
- A push cannot run twice on the same change; the second attempt is refused before a model call.
- A change that is not `APPLIED` cannot be pushed.
- A failed push leaves `canvasPushedAt` null and the control available.
- Everyone in the room sees the push through `ai-status-feed`, not just the person who started it.
- After pushing every applied change since the current spec, generating a spec produces one that **contains the changed architecture** — the check this whole unit exists for, and the one that has never passed.
- `42`'s drift notice reads differently depending on whether unpushed changes remain, and never tells someone to regenerate while a change has not reached the canvas.
- A signed-out caller and a non-member get no data and no confirmation the project exists.
- `npm run build` passes without type errors.
