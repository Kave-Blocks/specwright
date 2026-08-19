# 46 — Derive Units UI

`44` built the whole spec-to-build-units path and stopped at the route, by its own scope limit:
`ai-workflow-rules.md` forbids combining UI and background-task changes in one step, and the spec
path was split the same way across `27`/`28`/`29`. The consequence was that `POST /api/ai/units`
was reachable over HTTP and by `verify:units`, and **by nobody**. This unit is its caller — the
control on the Build tab that starts a derivation and reports what landed.

## What Shipped

**`hooks/use-project-build-units.ts` — `derive()`.** Posts `{ roomId: projectId }` to
`POST /api/ai/units` and returns a `BuildUnitRunHandle`, not a result: the units do not exist until
the run has written them. That is `propose`'s contract in `use-project-changes.ts`, not `create`'s,
and it is why **nothing is inserted optimistically** — the caller refreshes when the run completes,
through the `refresh()` that already existed. Token minting follows `pushToCanvas`'s two-step
fallback: use a `publicToken` if the trigger route ever returns one, otherwise mint from
`POST /api/ai/units/token`. Today's route returns only `{ runId }`, so the mint always runs; the
fallback is there so this hook does not have to change if that ever stops being true.

A refusal travels in the return value and never into the hook's `error`, which stays list-load
only — the split the hook already documents. The route's 409 for a project with no spec is worded
for a person ("Generate a spec first — build units are derived from one") and is shown as it is.

**`components/editor/build/derive-units-action.tsx`** — the control and its run.

- Tracked with `useRealtimeRun<typeof deriveUnits>`, keyed by run id, `skipColumns: ["payload"]`.
- **Settled on a `useEffect` watching the run's status, never `onComplete`.** `onComplete` fires at
  most once per mount, so a second derivation in the same session would never settle and the
  control would stay disabled forever. This is the bug `26` hit, `29` fixed, and `40` and `43` both
  carry the fix for; the guarded-`setTimeout` shape is copied from `CanvasPushAction` rather than
  invented a third time. A dropped subscription (`runError`) ends tracking too, so a network blip
  cannot leave the control dead.
- Progress reads the **run's own metadata**, which is where `44` publishes it — a build list is the
  one project resource with no second layer, so a derivation follows the spec and proposal path
  rather than the design agent's broadcast path. The shape is checked rather than trusted and falls
  back to a generic working line.
- On failure it prefers the message the run published over the local constant. Every refusal `44`
  raises is an `AbortTaskRunError` worded for a person, and a generic "please try again" would
  throw that away — unit `37`'s regression, which must not come back on a fourth surface.
- On success it calls `refresh()`, then reports the outcome from the run's **output**, validated
  field by field because a run output crosses the network exactly as metadata does.

**`components/editor/build/build-view.tsx`** — where it lives, and what it knows.

- The control sits **above every list branch, like the add form**, so a list that failed to load can
  still be derived into.
- Its treatment is **primary in the empty state** (`bg-brand text-white hover:bg-brand/90`, matching
  Generate Spec, which is the same shape of action) and **`secondary` once the list has units**,
  where the add form stays the primary way to type one and this must not compete with it.
- The no-spec question is answered **before the request**, by reusing `useProjectSpecs(projectId)` —
  already the one endpoint that reports it — rather than adding a route or a field to the
  build-unit listing.

**The outcome well** reuses the neutral `rounded-xl border border-surface-border bg-base` treatment
`41`, `42`, and `43` all use, with `role="status"` and never `alert`. **A derivation that creates
nothing is the expected result of running it twice**, so it says so plainly. Skips and drops read
differently on purpose — a skip means the build list already had that work, a drop means the model
returned an entry with no usable title — because `44`'s producer counts them apart and collapsing
them here would waste that. The skipped list follows the shape `41`'s already has and invents no
second treatment.

**The supporting line under the control is unconditional**, and it is the answer to the thing a
person is right to be nervous about when a button offers to fill their build list from an AI:
deriving only adds, and never edits, renames, reorders, or removes a unit they already have. That
is `38`'s producer contract stated where it is needed. While the control is disabled, the line
carries the **reason** instead, and the button points at it with `aria-describedby`.

## Deviations From The Spec

**One rendered control, not two.** The spec asks for the control "in the empty state" *and* "above
the list", from one component. Rendered literally, both are on screen at once in the empty state —
two live Derive buttons — and worse, the empty-state copy is the one that cannot report anything:
`refresh()` puts the list back into `isLoading`, which replaces the empty block with the spinner
**before** the outcome can be read, and the "No units yet" block unmounts taking the report with
it. Reporting what landed is the reason this unit exists (spec item 5), so a placement that
destroys the report on success is not a placement.

What shipped instead honours every behaviour the spec names, from one instance: it sits above every
list branch (which is the spec's own last bullet, and the fix for the unmount), takes the **primary**
treatment while the list is empty and **secondary** once it has units, and the "No units yet" block
offers deriving in its copy alongside its existing "add one above" line. The two treatments are one
component with a `treatment` prop, so the "two copies is how two behaviours appear" warning still
holds.

The primary treatment is gated on `!isLoading && !listError && units.length === 0` rather than
`units.length === 0` alone, so a populated Build tab does not flash a loud brand-coloured button on
every visit while its list loads.

**A fourth spec state, `unknown`.** The spec names three: no-spec, spec-list-loading, and ready. A
spec list that *failed to load* is none of them — `specs` is `[]`, which under a boolean would
render "generate a spec first", a claim the client does not have. So `specAvailability` has four
members and a failed spec load leaves the control **available**, for the route's 409 to answer.
That is consistent with the spec's own framing: "the route's 409 stays as the real guard; this is
an affordance, not a check."

**`runStatusText` / `runFailureText` moved to `lib/trigger-run.ts`** as `runMetadataText` and
`runMetadataFailureText`. They were private to `specs-view.tsx`, and this unit would have been
their third literal copy. `lib/trigger-run.ts` exists for exactly this ("the vocabulary lives here
rather than being restated per feature") and already held `isFinishedRunStatus`. `specs-view.tsx`
now imports them and its two private copies are gone; the bodies are unchanged, so the Specs tab
renders identically. `changes-view.tsx`'s `runErrorText` is **not** folded in — it reads the run's
`error`, not its metadata, because the canvas task publishes to the shared feed instead.

## Verified

Browser-driven 2026-08-19 in a signed-in Chrome session against `npx next dev` on port 3100, with
three throwaway fixture projects created directly in Postgres (spec+empty, spec+units, no-spec+
units) and **deleted afterwards**; the two pre-existing accounts' projects were used unmodified.
Values below are what the DOM actually reported, not what the code intends.

- **No spec, empty list** (`metaboss-72gd7f`) — the control renders, is `disabled`, wears the
  primary treatment (`rgb(0, 200, 212)` on white — `--brand`), and its `aria-describedby` target
  reads "This project has no spec yet — generate one on the Specs tab, since build units are
  derived from it." It does **not** disappear.
- **No spec, one unit** — same disabled state and same reason, wearing the **secondary** surface
  (`rgb(30, 30, 35)`). The existing unit row still reads `01 | Hand typed unit | SHIPPED | BROWSER`,
  so the add form, rows, and badges are untouched.
- **Spec, one unit** — `secondary` and **enabled**, supporting line "Deriving only adds units. It
  never edits, renames, reorders, or removes one you already have."
- **Spec, empty list** — **primary and enabled**, empty list, same supporting line.
- **The request path, over real HTTP.** Clicking it produced `POST /api/ai/units 200` followed by
  `POST /api/ai/units/token 200` in the dev server's log — the trigger call and the two-step token
  mint, both authenticated as the signed-in member. The control then read `Deriving…`, `disabled`,
  with a `role="status"` line showing the generic working line (no worker was running to publish
  metadata) and **no** `role="alert"`.
- **It never flashes the no-spec wording.** With `GET …/specs` delayed 2.5s in the page and the
  Build tab entered by client-side navigation, sampling every 100ms recorded exactly three states
  on a project **with** a spec: `(control not rendered)` → `[disabled] Checking whether this project
  has a spec…` → `[enabled] Deriving only adds units…`. The no-spec sentence never appeared.
- **And it does reach it when it should.** The same probe on a project **without** a spec recorded
  `(control not rendered)` → `[disabled] Checking whether this project has a spec…` →
  `[disabled] This project has no spec yet…`, and **zero** requests to `/api/ai/units` — a disabled
  control issues nothing.
- **The Specs tab still renders** after the `lib/trigger-run.ts` extraction, with Generate Spec
  present and enabled.
- **0 console errors** across every page visited; the single warning is Clerk's standard
  development-keys notice.

`npm run verify:db` — all six suites pass, so this unit did not silently break an earlier one.
`npm run build` passes, `npx tsc --noEmit` is clean, `npm run lint` is clean.

## Not Verified

Nothing below was checked, and none of it is claimed to work. All of it is blocked on the same
thing: **no `trigger dev` worker is running** (the standing ops item in `progress-tracker.md` —
`OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` are not synced into the Trigger.dev environment), so a
started run stays queued and never completes.

- **Every outcome state.** `outcome-with-creations`, `outcome-that-created-nothing`,
  `outcome-with-skips`, and `outcome-with-drops` have never rendered. `readDeriveOutcome`'s
  validation, the created/skipped/dropped wording, and the skipped-titles list are unobserved.
- **The list updating when the run completes**, without a manual reload — the whole point of
  `refresh()` on settle.
- **That a derived unit reads `specced` / `none` and carries the spec's version as lineage** *in the
  UI*. `verify:units` proves it at the database layer; nobody has seen the rows.
- **The failure state.** That a failed run shows the message the run published rather than the local
  constant is the `37` regression guard, and it has not been triggered on this surface.
- **Two derivations in the same session both settling.** This is the specific bug the
  `useEffect`-over-`onComplete` shape exists to prevent, and it needs two completed runs.
- **A second derivation reporting that nothing was created**, with the skipped titles, as a status
  rather than an error — and the list being unchanged afterwards.
- **That a hand-typed unit survives a derivation untouched** *through the UI*. `verify:units` checks
  it column by column at the database layer; the browser has not seen it.
- **The collaborator path**, which needs a second Clerk account — the same gap `38`, `41`, `43`, and
  `44` all carry.

The first six of those become checkable the moment a worker is running against a topped-up
`OPENAI_API_KEY`; they are the natural first task of the next live pass, alongside `43`'s
regenerate-and-see-the-change check.
