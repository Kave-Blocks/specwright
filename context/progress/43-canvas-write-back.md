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

Nothing below was checked, and none of it is claimed to work.

- **Everything that touches a Liveblocks room.** That `applyDesignPlan` really adds the nodes and
  edges into the room, that participants watch them arrive, that **no node or edge that existed
  before a push is missing after it**, and that AI presence appears and clears. This needs a
  signed-in browser, a running `npx trigger dev` worker, and a live model call.
- **The end-to-end check this whole unit exists for**: pushing every applied change since the
  current spec and then generating a spec that *contains the changed architecture*. It has never
  passed, because it could not before now.
- **The HTTP layer.** The route's two 409s, its 404 masking, and the signed-out and non-member
  paths are unexercised — there is no `verify:canvas-http` counterpart to `verify:apply-http`
  yet.
- **The browser.** The push control's five states (applied-and-unpushed, running, pushed,
  failed-and-retriable, outcome with removals versus without) and the drift notice's two wordings
  are unobserved.
- **Model behaviour.** Whether the prompt actually produces a sensible extension of an existing
  diagram is not something a script can assert. The filter is what guarantees it cannot do harm;
  nothing guarantees it does good.
- **The collaborator path**, which needs a second Clerk account — the same gap `38` and `41`
  carry.
- **Deployment.** The new task is registered by file placement under `trigger/`, but no
  `trigger dev` or `trigger deploy` run has picked it up yet.
