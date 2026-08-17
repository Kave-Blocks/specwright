# Canvas Write-Back — The Live Proof Unit 43 Has Never Had

**Closes:** two of the seven bullets in [`../progress/43-canvas-write-back.md`](../progress/43-canvas-write-back.md)'s `## Not Verified` — *everything that touches a Liveblocks room*, and *the end-to-end check this whole unit exists for* — plus the browser bullet in full if Part 4 is done, and the `trigger dev` half of the deployment bullet. It also settles the tracker's second open question, which is currently *structurally* closed and *factually* unproven.

**Does not close, and no browser pass can:** the **HTTP layer** (the route's two 409s, its 404 masking, the signed-out and non-member paths — that needs a `verify:canvas-http` script, which does not exist); the **collaborator path** ([`collaborator-account.md`](collaborator-account.md)); **`trigger deploy`** ([`trigger-deploy-audit.md`](trigger-deploy-audit.md)); and **model behaviour**, which is unfalsifiable by design. Read `## What to do with the result` before touching the tracker — however well this goes, 43 lands on `partial`, never `browser`.

**Blocked on:** one unconfirmed ops step — see prerequisite 2. The OpenAI quota was restored 2026-08-16, so the model half is clear.
**Effort:** ~45 minutes if prerequisite 2 is already done. Closer to two hours if it is not, and nobody has checked.

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
2. **Task environment variables — this is the blocker, and it has never been confirmed done.**
   `OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` must exist in the **Trigger.dev** environment, not
   just `.env.local` — task env is not auto-loaded from Next's env file. This is still an unticked
   item in the tracker's `## Open Questions` ("Ops for AI generation to run live"), and it blocks
   every AI path rather than just this one. **Check it before booking the time**: the Trigger.dev
   dashboard's environment-variables page for this project, or a `syncEnvVars` extension in
   `trigger.config.ts`. A missing key does not present as a config error — it presents as a run
   that starts and then dies inside the model call, which reads exactly like the guard working.
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
Items 13 and 14 are the **two of the control's five states the fixture cannot reach on its own**.
Parts 1–3 cover the other three (applied-and-unpushed, running, pushed, and the outcome well
without removals). Neither of these two is expensive, and skipping both leaves 40% of the control
unobserved after a pass whose entire purpose is observation.

13. **The outcome well *with* removals.** The seeded proposal carries only `added` and `modified`
    entries ([`../../scripts/seed-browser-fixture.ts`](../../scripts/seed-browser-fixture.ts)), so
    the skipped-removal list never renders. To reach it, hand-edit the stored proposal document to
    add one `{ kind: "removed", component: "…" }` entry before applying. Otherwise record it as
    unobserved and say so — do not report it as passing because the code path exists.
14. **Failed-and-retriable.** The `## What will most likely go wrong` section below is not a
    substitute for observing this: a refusal is an `AbortTaskRunError` and renders as a refusal
    message, so the guard misfiring does **not** exercise the failure state. To force it: apply the
    `browser-fixture-stale` project's `PROPOSED` change, remove `OPENAI_API_KEY` from the
    **Trigger.dev** environment, restart the worker, and push. The model call fails,
    `canvasPushedAt` is never written, and the control must return to offering the push rather than
    latching disabled — that is the retry property `verify:canvas -- retry` proves in the database,
    finally seen in the UI. Put the key back afterwards.

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
   **`partial`**, and name in the row which checks are now browser-backed. **Not `browser`**,
   however completely the pass goes — the HTTP layer and the collaborator path stay unexercised
   either way, and `partial` is defined as "some checks browser-verified, the file says which",
   which is exactly the state this leaves 43 in.
3. In the tracker's open questions, the canvas write-back entry currently says the end-to-end
   check "has never been run". Replace that paragraph with the result.
4. If the safety property in Part 2 fails, **stop and treat it as a defect, not a QA note.** It is
   the one outcome that makes the unit worse than not having shipped.
5. Delete this plan and its row in [`README.md`](README.md) — then file, in its place, the one gap
   this pass could not close and no other plan owns: a **`verify:canvas-http`** script, the
   counterpart to `verify:apply-http`, covering `POST /api/ai/canvas`'s two 409s, its 404 masking,
   and its signed-out and non-member paths. Running this pass is what makes that the next thing 43
   needs; leaving the folder empty would say 43 is finished, and it is not.
