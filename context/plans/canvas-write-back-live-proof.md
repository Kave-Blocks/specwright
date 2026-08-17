# Canvas Write-Back — The Live Proof Unit 43 Has Never Had

**Closes:** every unverified line in [`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md)'s `## Not Verified`, and the tracker's second open question, which is currently *structurally* closed and *factually* unproven
**Blocked on:** nothing — the OpenAI quota was restored 2026-08-16
**Effort:** ~45 minutes, most of it setup

## What the gap is

Unit 43 shipped with **45 library and database checks passing and not one line of it exercised
against a real Liveblocks room.** That was deliberate — the filter and the push guard are both
decided before any room is touched, so proving them with hand-authored input is stronger than
watching one lucky model run. But it leaves three things entirely unobserved:

1. **The check the whole unit exists for.** Push every applied change since the current spec, then
   generate a spec, and confirm it **contains the changed architecture**. This has never passed,
   because before 43 it could not. It is the single assertion that the change loop is closed.
2. **The safety property.** "No node or edge that existed before a push is missing after it." The
   destructive-operation filter is proven in isolation against hand-authored plans; it has never
   been proven against a room with real content in it.
3. **The UI.** The push control's five states and the drift notice's two wordings.

## Why it matters

Everything verified so far proves the *machinery* and not the *result*. `verify:canvas` proves a
`deleteNode` never survives the filter; it cannot prove that what does survive draws a sensible
diagram, or that `applyDesignPlan` leaves the rest of the canvas alone when it runs for real.

The second item is the one to care about. Unit 43's stated purpose is that a record of what was
built survives being replaced — the same value `41` exists for. If a push silently drops
somebody's nodes, the unit does the exact opposite of its reason for existing, and **nothing
currently in the repo would notice.**

And until item 1 passes, the honest description of Specwright is still the one 43 set out to
retire: the loop *looks* closed and has never been observed closing.

## Prerequisites

These are the reason this is a 45-minute job rather than a 10-minute one. Do them in order.

1. **A signed-in Clerk account** in the browser the pass will run in.
2. **Task environment variables.** `OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` must exist in the
   **Trigger.dev** environment, not just `.env.local` — task env is not auto-loaded from Next's
   env file. This is the standing ops item in the tracker's open questions; it blocks every AI
   path, not just this one.
3. **The dev worker running**: `npm run trigger:dev`. The `canvas-sync` task has never been picked
   up by a worker, so **watch the startup output for it by name.** A task that fails to register
   is the first thing that will go wrong here, and it will present as the run never starting.
4. **The fixture**:
   ```
   npx tsx scripts/seed-browser-fixture.ts --email <the signed-in account>
   ```
   It creates a `browser-fixture-apply` project with spec v1, three shipped units, and a
   **`PROPOSED`** change. Applying it is step 1 of the pass, which is what we want — the push
   control is supposed to appear the moment an apply creates the drift.
5. **Canvas content, drawn by hand.** The seed script cannot create it: canvas nodes live in
   Liveblocks Storage, not Postgres. Open `/editor/{projectId}/canvas` and either import a starter
   template or draw **4–6 nodes with a few edges between them**. Then **write down every node
   label and the edge count** — that list is the baseline for check 2, and taking it *before* the
   push is the entire point.

## The pass

**Dispatch to `browser-qa`, not the main session.** A browser pass returns page snapshots and
screenshots, and those belong in a cheap subagent that reports back in prose.

### Part 1 — the push itself

1. Go to `/editor/{projectId}/changes`, expand the seeded change, and **Apply** it.
2. The apply outcome well renders. Directly beneath it, in the settled block, the **"Add to
   canvas"** control must appear, in the `secondary` treatment — *not* the primary `bg-brand`
   treatment Apply wears. If it is primary, that is a real regression against `ui-context.md`.
3. Press it. While the run is in flight the button must be disabled and read "Adding to canvas…".
4. **Switch to the canvas tab while the run is still going**, or have a second tab already open on
   it. Two things must be true there: the AI presence appears (the "Specwright" participant in the
   purple accent), and nodes arrive **live** rather than on reload. This is the `ai-status-feed`
   broadcast path — if it only appears after a refresh, the write went in but the realtime path
   did not, and that is worth its own finding.

### Part 2 — the safety property (the important one)

5. Against the baseline list written down in prerequisite 5: **every node that existed before the
   push still exists, with the same label, and the edge count has not gone down.** New nodes are
   expected; a missing one is a defect that stops the pass.
6. Confirm the AI presence **clears** once the run finishes.

### Part 3 — the check the unit exists for

7. Go to `/editor/{projectId}/specs`. The drift notice must now read its **second** state —
   the changes are on the canvas, so generating a new spec will describe them. Before the push it
   read the first state; if the wording did not change, `unpushedSinceCurrentSpec` is not
   reaching the view.
8. Press **Generate Spec**.
9. **Read the generated Markdown and find the change's added component in it.** This is the
   assertion. Quote the sentence verbatim in the write-up — a paraphrase is not evidence.
10. Confirm the drift notice is now gone entirely (the count reset, correctly, because a new spec
    really does describe the current state).

### Part 4 — the refusals and the remaining states

11. Re-expand the pushed change. It must say it is on the canvas and offer **no** control. There
    is no re-push.
12. Expand a change that is still `PROPOSED` (the `browser-fixture-stale` project has one). It
    must offer Apply and Discard and **no** push control.
13. **The removals branch.** The seeded proposal has no `removed` entries, so the skipped-removal
    list will not render on its own. Either hand-edit a proposal document to include one, or
    accept this state as unobserved and say so — do not report it as passing because the code path
    exists.

## What will most likely go wrong

Written down so it is recognised rather than debugged from scratch:

- **The task does not register.** `canvas-sync` has never been through a worker. Check the
  `trigger:dev` startup output first, before assuming the UI is at fault.
- **The run starts and fails immediately** with a refusal message shown in the control. That is
  the guard working — read which of the two refusals it is. "Only an applied change" means the
  status flip did not land; "already on the canvas" means a previous attempt got further than it
  appeared.
- **Nodes arrive but nowhere sensible.** Layout quality is a model-behaviour observation, not a
  defect. Note it and move on; it is explicitly outside what this unit guarantees.

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` to
   [`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md) recording what ran,
   **quoting the generated spec's sentence** that names the change's component. Move the items it
   proved out of that file's `## Not Verified` list.
2. Update unit 43's row in [`../progress-tracker.md`](../progress-tracker.md): `structural` →
   `partial` (or `browser` if Part 4 item 13 was covered too).
3. In the tracker's open questions, the canvas write-back entry currently says the end-to-end
   check "has never been run". Replace that paragraph with the result.
4. If the safety property in Part 2 fails, **stop and treat it as a defect, not a QA note.** It is
   the one outcome that makes the unit worse than not having shipped.
5. Delete this plan and its row in [`README.md`](README.md).
