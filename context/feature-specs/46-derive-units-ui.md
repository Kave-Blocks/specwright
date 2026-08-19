Unit `44` built the whole spec-to-build-units path and stopped at the route, per its own scope limit. Nothing in the product calls `POST /api/ai/units`, so the capability exists and no person can reach it. This unit adds the control that runs it, on the Build tab, and reports what landed.

`38` deferred the initial producer, `41` created the asymmetry by giving the *change* path one, and `44` closed it in the backend. Until this ships, the asymmetry is still there for anyone actually using Specwright: applying a change produces units automatically while the first twenty are still typed by hand.

## Implementation

Unit `44` must be shipped first. It is, and its route is reachable over HTTP today.

1. `hooks/use-project-build-units.ts` — the hook gains the derivation.
   - `derive()` posts `{ roomId: projectId }` to `POST /api/ai/units`, then mints a run token from `POST /api/ai/units/token`, and returns the run handle. **`ChangeRunHandle`'s shape and `pushToCanvas`'s two-step fallback are the model** (`hooks/use-project-changes.ts`): if the trigger route already returned a `publicToken`, use it and mint nothing.
   - It returns a handle rather than a result, because the units do not exist until the run has written them. This is `propose`'s contract, not `create`'s — **do not optimistically add anything to `units`**.
   - A refusal travels in the return value, never into the hook's `error`, which stays list-load only. The 409 for a project with no spec is worded for a person by the route; show it as it is.
   - `refresh()` already exists and is what the caller uses when the run completes. Do not add a second reload path.

2. `components/editor/build/derive-units-action.tsx` — the control and its run.
   - Track the run with `useRealtimeRun<typeof deriveUnits>`, keyed by run id, `skipColumns: ["payload"]`.
   - **Settle on a `useEffect` watching the run's status, not on `onComplete`** — that fires at most once per mount, so a second derivation in the same session would never settle and the control would stay disabled forever. This is a bug `26` hit, `29` fixed, and `40` and `43` both carry the fix for; copy the guarded-`setTimeout` shape from `CanvasPushAction` in `changes-view.tsx` rather than inventing a third.
   - A dropped subscription also ends tracking, or a network blip leaves the control dead.
   - Progress rides on the **run's own metadata** — `44` publishes `phase` and `text` there deliberately, because a build list is not a shared realtime document. Read it the way `specs-view.tsx` does, checking the shape rather than trusting it, and fall back to a generic working line.
   - On failure, prefer the message the run published over any local constant. Every refusal `44` raises is an `AbortTaskRunError` worded for a person — "this project has no spec", "the spec moved" — and a generic "please try again" would throw that away. This is unit `37`'s regression; it must not come back on a fourth surface.
   - On success, call `refresh()`, then report the outcome from the run's **output** (`DeriveUnitsResult`: `createdCount`, `skippedTitles`, `droppedCount`). Validate it — a run output crosses the network exactly as metadata does.

3. `components/editor/build/build-view.tsx` — where the control lives.
   - **In the empty state, it is the primary action.** An empty build list with a generated spec is the exact situation this unit exists for, so the "No units yet" block offers deriving alongside its existing "add one above" line.
   - **Above the list, it is secondary and quiet**, beside the add form — a project that already has units may still derive, because the producer only adds and a second derivation is a no-op. It must not compete with the add form, which stays the primary way to type a unit.
   - Render it in **both** places from one component. Two copies is how two behaviours appear.
   - The control sits above every list branch, like the add form does, so a list that failed to load can still be derived into.

4. **The no-spec state is answered before the request, not by it.**
   - The Build view does not know whether the project has a spec. Reuse `useProjectSpecs(projectId)` — it already exists, is already the one endpoint that reports this, and returns `specs` — rather than adding a route or a field to the build-units listing.
   - With no spec, the control renders **disabled with the reason on it**, not hidden: a hidden control teaches nothing, and "generate a spec first" is the actionable half of the message. The route's 409 stays as the real guard; this is an affordance, not a check.
   - While the spec list is still loading, the control is disabled and says so. It must never flash "no spec" before the answer arrives.

5. **Report what landed, including what did not.**
   - The outcome names the units created, the titles skipped because a unit with that key already exists, and — when non-zero — the entries dropped for having no usable title.
   - **`skipped` and `dropped` are different facts and must read differently.** A skip means the build list already had that work; a drop means the model returned something unusable. `44`'s producer counts them separately on purpose, and collapsing them in the UI would waste that.
   - A second derivation that creates nothing is the **expected** outcome, not a failure: every derived key already exists. Say so plainly — `role="status"`, never `alert`.

6. **A destructive-sounding action that is not destructive should say so.** Before running, the control's supporting line states that deriving only adds units and never edits or removes an existing one. That is `38`'s producer contract, and it is the thing a person is right to be nervous about when a button offers to fill their build list from an AI.

7. `context/ui-context.md` — record the control's placement, its two treatments, and the outcome's three counts under the Build section.

## Dependencies

Already installed: `@trigger.dev/react-hooks`, `lucide-react`.

To install: nothing.

No new environment variables. **This unit makes no model call of its own** — it starts `44`'s task, which makes one.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- **Empty state: primary treatment** (`bg-brand text-white hover:bg-brand/90`), matching Generate Spec on the Specs tab, which is the same shape of action. **Beside the add form: `secondary`**, the treatment `43` established for a follow-on action that must not compete with the primary one on its panel.
- The outcome reuses the neutral `rounded-xl border border-surface-border bg-base` well that `41`, `42`, and `43` all use, with `role="status"`. The skipped list follows the shape `41`'s skipped-titles list already has — a line of explanation, then the titles as items, the bullet as `text-copy-faint` decoration. **Do not invent a second list treatment.**
- While the run is in flight the control is disabled and says so, with a `role="status"` `aria-live="polite"` line carrying the run's published text.
- A failure renders `role="alert"` with `text-error`, and **leaves the control available** — nothing was written, so it is retriable.
- Component states to cover: no-spec-yet (disabled, with the reason), spec-list-loading (disabled), ready, running, outcome-with-creations, outcome-that-created-nothing, outcome-with-skips, outcome-with-drops, and failed-and-retriable.

## Scope Limits

- do not change `POST /api/ai/units`, `trigger/derive-units.ts`, or anything under `lib/unit-agent/` — `44` is shipped and verified, and this unit is its caller
- do not write `status`, `verified`, or `sequence` from this surface; they are human-owned and the producer already refuses to set them
- do not add a "re-derive" or "clear and re-derive" control. The producer only adds, and a control implying otherwise would promise something the backend correctly refuses to do
- do not auto-derive when a spec is generated, or on first visit to an empty Build tab — `43` and `44` both state the reason: an action that fills somebody's list must be asked for
- do not optimistically insert units; the run writes them, and the list is refreshed when it completes
- do not add a second reload path, a second run-settling shape, or a second token route
- do not gate on `useRoomReady`. `29` gates Generate Spec on it because that action reads the room's `ai-chat` feed; `44`'s task reads the spec and the unit list **server-side**, so this action needs no room connection and must not pretend to
- do not change the add form, the unit rows, or any of `38`/`38a`/`39`/`41`'s badge work

## Notes

- Read `context/architecture-context.md` — `## Build Units` for the producer contract, and `## Canvas Write-Back` for the run-tracking and outcome-reporting shape this follows.
- `components/editor/changes/changes-view.tsx`'s `CanvasPushAction` is the closest existing analogue: a control that starts a durable run, disables while it is in flight, reports what landed, and stays available on failure. Follow it rather than re-deriving the shape.
- `components/editor/specs/specs-view.tsx`'s `GenerateSpecAction` is the closest analogue for reading **run metadata** specifically, since `44` publishes progress there rather than on `ai-status-feed`.
- The three counts the outcome renders are `DeriveUnitsResult` in `trigger/derive-units.ts`. Do not re-declare their shape.
- After this ships, `44`'s progress file's "**No UI**" scope-limit note and its tracker row both stop being true — update them.

## Check When Done

- On a project with a spec and an empty build list, the empty state offers deriving, and running it fills the list with units that read `specced` / `none` and carry the spec's version as their lineage.
- The list updates when the run completes, without a manual reload.
- Deriving a second time reports that nothing was created and lists the skipped titles, as a status rather than an error, and the list is unchanged.
- A unit that was typed by hand is not renamed, re-attributed, reordered, or removed by a derivation.
- On a project with no spec, the control is visibly disabled and says a spec is needed; it does not disappear, and it does not issue a request.
- While the spec list is loading, the control never flashes the no-spec wording.
- A failed run leaves the control available and shows the message the run published, not a generic retry line.
- Two derivations in the same session both settle — the second is not left permanently disabled.
- Dropped entries, when the model returns any, are reported separately from skipped titles.
- The Build tab's add form, unit rows, and badges are unchanged.
- `npm run verify:db` still passes in full.
- `npm run build` passes without type errors.
