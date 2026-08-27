# 43 — Canvas Write-Back

Applying a change moved the build list and left the canvas alone. The canvas is what a spec is
written from, so every applied change was invisible to the next spec: regenerate one and it
silently described a system without any of the work the changes had added. This unit pushes an
applied change onto the canvas **through the existing design path**, additively, and closes the
last structurally broken link in the change loop.

This is what `41` was waiting for. It wrote no spec and touched no room deliberately, and `42`
made the consequence countable but could only ever *report* it — the instruction `42` had to
give, "put the change on the canvas yourself", was manual work the system already had the pieces
to do. That instruction is now an action.

## What Shipped

**The one column.** `ProjectChange.canvasPushedAt DateTime?`, in a purely additive migration
(`20260817120000_add_canvas_push`), applied to the real Postgres with `prisma migrate deploy` —
the `05-prisma.md` fallback flow, since the shadow-database step is not usable against this
database. The schema comment states the contrast with `42` explicitly: drift got no column
because two existing numbers already implied it, and a push implies nothing, because the canvas
is a CRDT document with no memory of which change produced which node. `39`'s rule decides both
cases the same way, and a push is an event that happened. `null` doubles as the retry state.

**`lib/canvas-sync/plan.ts`** — the prompt and the filter, and no model call of its own.
`buildCanvasSyncPrompt` composes the request string `generateDesignPlan` already accepts, so
`DESIGN_MODEL` stays the single place the model is named; only `added` and `modified` entries
reach it, and `removed` entries are excluded *there* rather than filtered later, so the model is
never even shown something it might draw as a deletion. `filterAdditivePlan` strips every
`deleteNode`, `deleteEdge`, `moveNode`, and `resizeNode` from the returned plan before it reaches
`applyDesignPlan`, and counts the drops. It is written as an **allow-list** of the three additive
verbs rather than a deny-list of the four destructive ones, so an operation added to
`DesignOperationName` later is dropped by default instead of silently inheriting permission.
`skippedRemovals` returns the removed components' names for reporting.

**`lib/canvas-sync/change.ts`** — `loadPushableChange` and `markChangePushed`. The refusal rule
(not found / not applied / already pushed) is written once and asked twice: by the route before a
run is started, and by the task because a change can move in between.

**`trigger/canvas-sync.ts`** — the durable task, shaped exactly like `trigger/design-agent.ts`:
re-check the guard, announce and take AI presence, read the canvas with a read-only `mutateFlow`,
one `generateDesignPlan` call, filter, apply through `applyDesignPlan` in a second `mutateFlow`,
then record the push. Progress rides on the shared **`ai-status-feed`**, not the run's metadata —
a canvas change happens to everybody. Every refusal is an `AbortTaskRunError`, since none of them
becomes true by waiting; quota exhaustion goes through the existing `isQuotaExhaustedError`.

**`app/api/ai/canvas/route.ts`** and **`token/route.ts`** — mirroring `app/api/ai/design/`.
`projectId` arrives in the body, not the path. The two 409s (not applied, already pushed) are
answered **before** the run is triggered, so a request that cannot succeed never spends a model
call.

**`types/changes.ts`** — `ChangeSummary.canvasPushed` as a boolean rather than the timestamp
(the UI renders a control's availability, not a date), and `ChangeCanvasPushOutcome` carrying
what landed plus the skipped removals by component name.

**`components/editor/changes/changes-view.tsx`** — `CanvasPushAction` in the settled block of an
applied change, `secondary` treatment, with running / pushed / failed-and-retriable states and an
outcome well that lists the removals that were not drawn.

**`components/editor/specs/specs-view.tsx`** — `42`'s drift notice gains its second state, fed by
a new `unpushedSinceCurrentSpec` count on the existing spec-listing route.

## Deviations From The Spec

**The push control is rendered once, in the settled block, not twice.** The spec asked for it in
`41`'s apply outcome *and* in the expanded body of an already-applied change. Those are the same
place: `useProjectChanges.apply` flips the row's status to `applied` locally, so the settled
block renders immediately after an apply, directly under the outcome well. One control, one code
path, both moments covered. The outcome well's closing line was reworded to stop repeating the
instruction the control now embodies.

**The room id is not accepted from the client.** The spec's task payload is
`{ projectId, changeId, roomId }` and it still is, but the route derives `roomId` from the
access-checked `project.id` rather than reading it from the body — deliberately stricter than
`POST /api/ai/design`, which passes a client-supplied `roomId` straight through. One room per
project and the room id *is* the project id, so a body-supplied room would be an unverified claim
about which shared document to mutate.

**`lib/canvas-sync/change.ts` is a second module the spec did not name.** The alternative was
duplicating the refusal rule in the route and the task, which is how two copies of one rule come
to disagree. It also makes the rule reachable by the verification script.

**`lib/design-agent/room.ts` is an extraction, not new behaviour.** The spec said to reuse
`announce` and the AI presence handling rather than restate them; both were private to
`trigger/design-agent.ts`, so they moved to a shared module that both canvas-mutating tasks
import. The AI's name, colour, cursor, and TTLs are now defined once — two copies is how one task
comes to show a different participant from the other. `design-agent.ts`'s behaviour is unchanged;
its `announce` is now a one-line binding of the task's label onto the shared helper.

**A second drift number was added, and `42`'s counting rule was not changed.**
`countAppliedChangesSinceCurrentSpec` now also returns `unpushedSinceCurrentSpec`.
`appliedSinceCurrentSpec` means exactly what it meant — pushing to the canvas does not clear
drift, only generating a spec does, and the verification script asserts that asymmetry directly.
The second number decides only whether regenerating would *help*, which is what the notice's two
states turn on. The client defaults a missing `unpushedSinceCurrentSpec` to the *applied* count
rather than to zero, so a response that predates this unit gets the cautious wording rather than
the one that says regenerating is safe.

## Known Limit, Stated Rather Than Hidden

**Two simultaneous pushes of the same change can both draw.** `canvasPushedAt` is written only
after the room mutation succeeds — the spec requires this, and it is what makes a failed push
retriable — so nothing between Postgres and the CRDT is atomic. Two members pressing the control
at the same instant can both pass `loadPushableChange` and both draw the delta. Closing the
window would mean claiming the push *before* mutating, which trades a rare duplicate for a
routine unrecoverable one: a crash after the claim would mark a change drawn that was never
drawn, and it could never be pushed again. The route's pre-check and the task's re-check narrow
the window to roughly the length of one model call. This is recorded in
`architecture-context.md` under `## Canvas Write-Back` so it is a decision rather than a bug
someone rediscovers.

## Verified

`npm run verify:canvas -- all` — **45 checks, all passing**, against the real Postgres and the
real Blob store, with no model call and no Liveblocks room anywhere in it. That absence is
deliberate: the two things this unit must never get wrong are both decided before any room is
touched, so feeding a hand-authored plan through the filter proves the guard holds *regardless of
what the model emits*, which observing one good model run never could.

- `filter` — a plan containing `deleteNode`, `deleteEdge`, `moveNode`, and `resizeNode` has
  exactly those four dropped and the additive three kept, in order, with the drop counted; an
  all-destructive plan applies nothing; the input plan is not mutated; a malformed plan passes
  through untouched so `applyDesignPlan` still fails loudly rather than the filter turning it
  into a silent no-op.
- `prompt` — added and modified components reach the prompt, removed ones never do, the additive
  intent is stated in the request rather than left to the system prompt, and `skippedRemovals`
  names the removed components and only those. A removals-only delta asks for an empty operations
  list rather than sending an instruction-free prompt the model would fill in itself.
- `guard` — proposed and discarded changes are refused as `not-applied`; an applied, unpushed one
  is allowed and carries its proposal path; a second push is refused as `already-pushed`; marking
  twice does not move the recorded time; a change id from another project reads as `not-found`
  through a project the caller does belong to.
- `retry` — applying a change does not mark it pushed, so the failed-push state *is* the fresh
  state and the change stays pushable; a successful push closes it.
- `drift` — pushing one of two applied changes lowers `unpushedSinceCurrentSpec` to 1 and leaves
  `appliedSinceCurrentSpec` at 2; generating a spec clears both.

Also: `npm run build` passes with both new routes registered (`/api/ai/canvas`,
`/api/ai/canvas/token`), `npm run lint` is clean, and `npm run verify:drift -- all` still passes
in full — unit `42`'s counting was extended, not altered.

## Not Verified

The live proof of 2026-08-27 (see the follow-up below) closed the room, browser, end-to-end and
`trigger dev` items that used to be listed here. What is left was never reachable from a browser.

- **The HTTP layer.** The route's two 409s, its 404 masking, and the signed-out and non-member
  paths are unexercised — there is still no `verify:canvas-http` counterpart to `verify:apply-http`.
  Filed as [`../plans/verify-canvas-http.md`](../plans/verify-canvas-http.md); this is the next
  thing `43` needs.
- **Model behaviour.** Whether the prompt actually produces a sensible extension of an existing
  diagram is not something a script can assert. The filter is what guarantees it cannot do harm;
  nothing guarantees it does good. The 2026-08-27 pass sharpened this rather than settling it — the
  model relabelled an existing node to match a `modified` entry, which was legal at the time and was
  disclosed. That particular freedom is now gone (see the second follow-up below): an `updateNode`
  only survives against a node the delta names. What remains unfalsifiable is the wider question —
  whether what the model *does* draw is a sensible diagram.
- **The collaborator path**, which needs a second Clerk account — the same gap `38` and `41`
  carry. See [`../plans/collaborator-account.md`](../plans/collaborator-account.md).
- **`trigger deploy`.** The `trigger dev` half is now proven — worker `20260821.1` registered the
  task and really ran it, twice. No production deploy has picked it up. See
  [`../plans/trigger-deploy-audit.md`](../plans/trigger-deploy-audit.md).

### Follow-up — 2026-08-27 — the live proof

Ran `plans/canvas-write-back-live-proof.md` end to
end (deleted on completion, as that folder's convention requires) in a signed-in browser: dev server on port 3001, Trigger.dev worker `20260821.1` with
`canvas-sync` registered, both fixtures from
[`../../scripts/seed-browser-fixture.ts`](../../scripts/seed-browser-fixture.ts). Zero console
errors across the pass.

**The check this unit exists for passed.** The seeded change was applied, pushed to the canvas, and
a new spec generated from that canvas. Version 2 contains, verbatim:

> "The Realtime Canvas interacts with a Sync Queue for managing real-time updates."

`Sync Queue` is the change's `added` delta entry. The loop is now observed closing, not inferred
closing.

**What else the pass observed.** The drift notice moved between both wordings — *"It hasn't reached
the canvas yet, and specs are written from the canvas"* before the push, *"It's on the canvas, so
generating a new spec now will describe it"* after — and disappeared once v2 existed. All **five**
states of the push control were seen, which no earlier pass had managed: applied-and-unpushed
(secondary treatment, not `bg-brand`), running (disabled, "Adding to canvas…"), pushed (no control,
no re-push), outcome-with-removals, and failed-and-retriable. Nodes arrived over the realtime
channel with no reload, and the AI presence appeared and then cleared.

The removals well rendered without hand-editing a stored document, because the fixture was given a
`removed` entry first — see the fixture note below. It read: *"1 part of the change retires
something, which Specwright doesn't remove for you — take these off the canvas yourself:"* →
`Direct socket writer`.

Failed-and-retriable was forced by commenting `OPENAI_API_KEY` out of `.env.local` and restarting
the worker. `POST /api/ai/canvas` returned 201, the run resolved to failure with **"OPENAI_API_KEY
is not set"**, `canvasPushedAt` was never written, and the control **returned to offering the push
rather than latching disabled** — the retry property `verify:canvas -- retry` proves in the
database, now seen in the UI. The key was restored and the worker restarted afterwards.

**The safety property held as this file states it, and not as the plan worded it.** Nothing was
deleted: all seven baseline nodes survived, and the edge count went 6 → 8. But one baseline node's
**label did not survive**. The baseline was the Microservices starter template; after the push the
node `ms-orders` — same id, same position, both its edges intact — read **"Realtime Canvas"**
instead of **"Orders Service"**, matching the delta's `modified: Realtime canvas` entry. The outcome
well disclosed it as *"1 node updated."*

This is permitted by design, not a filter escape: `updateNode` is in `ALLOWED_OPERATIONS` in
[`../../lib/canvas-sync/plan.ts`](../../lib/canvas-sync/plan.ts). It is still worth recording as a
gap, because the filter's own stated contract is that *the one thing this unit must never do is
destroy canvas work in order to record a change*, and the same file excludes `moveNode` and
`resizeNode` on the grounds that *nothing in an architecture delta justifies moving somebody else's
diagram*. Overwriting a node's identity is that harm and worse — a move is visible and recoverable,
a relabel is not. **Closed the same day** — see the second follow-up below. The
mitigating detail: the baseline template had no "Realtime canvas" node to match, so the model
reached for the nearest one; a real project's canvas would usually contain it.

**A defect outside this unit, found by this pass.** On a *fresh page load* of `/specs`, Generate
Spec fails with *"Add some nodes to the canvas before generating a spec"* despite the canvas holding
eight saved nodes, and **no request is sent**. Reached instead by client-side navigation from the
canvas, the same action succeeds immediately. It is a Liveblocks hydration race — the button is
interactive before Storage resolves — and it blocked this pass until it was routed around. It
belongs to the spec-generation units, not to `43`. Filed as
[`../plans/specs-cold-load-race.md`](../plans/specs-cold-load-race.md).

**Fixture change.** [`../../scripts/seed-browser-fixture.ts`](../../scripts/seed-browser-fixture.ts)
now seeds a third delta entry on the apply fixture — `removed: "Direct socket writer"`. The plan had
called for hand-editing the stored proposal document to reach the removals well; putting it in the
seed makes that state reachable in the ordinary pass and keeps it reachable for the next one. It
cannot affect what the push draws: `removed` is excluded from the prompt at
[`../../lib/canvas-sync/plan.ts`](../../lib/canvas-sync/plan.ts) and only feeds `skippedRemovals`.

### Follow-up — 2026-08-27 — `updateNode` scoped to the nodes a change names

Closed the gap the live proof found earlier the same day, taking **option 1** of the plan it was
filed as (`plans/canvas-sync-update-node-scope.md`, deleted on completion): constrain the target
rather than drop the operation or accept the limit.

**The rule.** An `updateNode` survives the filter only when the node it targets currently carries a
label matching a **`modified`** entry in that change's delta. Matching is case-insensitive with
whitespace collapsed. `added` entries license nothing: `added` says the canvas does not have that
part yet, so a node already carrying that label belongs to somebody else.

The looseness is argued from asymmetry, not taste, and the argument is recorded in
[`../../lib/canvas-sync/plan.ts`](../../lib/canvas-sync/plan.ts) and in
[`../architecture-context.md`](../architecture-context.md)'s `## Canvas Write-Back`. Too strict and
the component is drawn as a **new node** — additive, visible, mergeable by hand. Too loose and a
node keeps its id, position and edges while quietly becoming a different thing, which nothing
downstream can detect, because the next spec generated from that canvas describes the new label as
though it had always been there. So the match forgives case and stray whitespace and nothing else.
Substring or token-overlap matching is the obvious next step and is explicitly refused: architecture
labels share generic words, so `Users Service` would license an update against `Orders Service` —
the original bug, reintroduced.

**A refused update is reported, not logged and forgotten.** It is counted apart from
`droppedOperations`, which stays reserved for `deleteNode`/`deleteEdge`/`moveNode`/`resizeNode`.
That number should never be non-zero and reads as an alarm; an update aimed at the wrong node is
ordinary. One counter would hide the ordinary case inside the alarm. The outcome well now says:
*"Specwright was asked to rename 1 node this change never mentions, and didn't — it is untouched on
the canvas."*

**The outcome also names what it did change.** `ChangeCanvasPushOutcome` gained `updatedNodes`,
each carrying the label its node had **before** the push, so the well reads
`Orders Service — now Realtime Canvas` rather than the bare `1 node updated` that made the original
overwrite undiscoverable. A restyle with no rename reports the label once rather than inventing
`X — now X`.

**Behaviour change worth knowing.** A `modified` entry that matches no node on the canvas is now
drawn as a new node instead of relabelling whatever the model picked. A canvas can therefore end up
holding both `Orders Service` and a new `Realtime Canvas`. That is the intended direction — the loss
that cannot be detected is the one worth preventing — and it is why the refusal is surfaced in the
outcome rather than left in a log.

**Verified.** `npm run verify:db` passes at **278 assertions**, up from 253; `npx tsc --noEmit`
exits 0; `npx eslint` on every changed file exits 0. The new `update` phase of
[`../../scripts/verify-canvas-write-back.ts`](../../scripts/verify-canvas-write-back.ts) reproduces
the 2026-08-27 failure exactly — canvas holding the Microservices template, delta naming
`Realtime canvas`, an `updateNode` aimed at `Orders Service` — and asserts it is refused, reported
by the label the node still carries, and **not** counted as a destructive drop. It then applies the
surviving plan to an in-memory flow and reads the labels back, so the assertion is that
`Orders Service` still reads `Orders Service` on the canvas rather than that the filter returned the
right array. The legitimate case is asserted alongside it — a node labelled `Realtime Canvas`
against a delta naming `Realtime canvas` is permitted, lands, and leaves every other node alone —
so the rule cannot pass by refusing everything.

**Not verified.** No live room, no model call, and no browser. The filter is proven against
hand-authored plans, which is the stronger proof for a guard, but the outcome well's two new blocks
have not been seen rendered. They are cheap to fold into the next browser pass on this surface.
