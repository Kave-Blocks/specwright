# 42 — Spec Drift

Spec: [`context/feature-specs/42-spec-drift.md`](../feature-specs/42-spec-drift.md)

Applying a change moves the build list and leaves the spec where it was. This unit makes that gap **visible and countable** — "2 changes applied since Version 3" — at the two points a person can act on it. It regenerates nothing.

Unit `41` closed the write half of the change loop; this closes the read half. The failure it prevents is silent: without it the next proposal is reasoned against a spec that does not contain the work the last one added, so it re-proposes that work, and `41`'s key-collision skip reports the duplicate as "1 unit skipped" with no hint that a stale spec is the cause.

**No schema change, no migration, and no model call anywhere in this unit.** It counts rows that units 39, 40, and 41 already write.

## What Shipped

### Schema and Migration

**None, deliberately.** `prisma/` is untouched and no migration was generated. A change already stores `baseSpecId`, and a spec version is only ever assigned upward, so a spec is behind exactly when an `APPLIED` change's base version is still the project's highest — had a spec been generated after that change, the current version would be higher. A `specStaleSince` column would store nothing those two numbers already say and would need keeping in sync with every apply and every generation. This is `39`'s rule a third time: record a fact already true, not one that anticipates a relationship.

### Server Library

`lib/changes.ts` (edit): gained the two derived quantities and, with them, a second reason to be server-only. It was previously pure vocabulary — the one place SCREAMING_SNAKE `ChangeStatus` members translate to the lowercase wire values — and now also queries. The module doc says so rather than leaving the change of character implicit.

- `currentSpecVersionOf(projectId)` — **moved here from `lib/changes/apply.ts`**, where `41` had it private. `42` needs the same answer, and the spec's note was explicit: do not write a third implementation of "which spec version is current". The reasoning travelled with it — the version is read from the spec rows, never from `Project.nextSpecVersion - 1`, because the counter records the last number *assigned* and the two diverge the moment a spec is removed.
- `countAppliedChangesSinceCurrentSpec(projectId)` — returns `{ appliedSinceCurrentSpec, currentSpecVersion }`. Counts `APPLIED` changes whose `baseSpec.version` equals the current version, filtering **through the relation** rather than resolving the current version's id first, which would be a second query to say the same thing. A project with no specs returns `0` and a `null` version rather than erroring: there is nothing to be behind.

Both numbers come back together because the one surface that renders them renders them in the same sentence.

`lib/changes/apply.ts` (edit): the private copy of `currentSpecVersionOf` deleted and imported from `lib/changes` instead. A comment stands where it was, recording that it moved and why, so the next reader looking for it in `41`'s module finds the pointer rather than an absence.

### HTTP Routes

`app/api/projects/[projectId]/specs/route.ts` (edit): `GET` gained the two fields beside `specs`. **No new route** — the Specs view already calls this one on mount, so a second endpoint would double the requests to report one number, and the two would then be fetched at different moments and could disagree on screen. The spec list read and the drift count are independent, so they run in one `Promise.all` rather than queueing. `withProjectMember`, the ordering, and the `filePath`-never-selected discipline are all unchanged.

### Wire Types

`types/specs.ts` (edit): `ProjectSpecListResponse` gained `appliedSinceCurrentSpec: number` and `currentSpecVersion: number | null`. No change id and no spec id travels — the same discipline that keeps `filePath` off `ProjectSpecSummary`.

### UI Components

`hooks/use-project-specs.ts` (edit): carries both numbers alongside `specs`, held in one `SpecDriftState` object so the pair can never half-update. They are refreshed by the reload the hook already performs after a generation finishes, so **generating a spec clears the drift with no second mechanism**. Two defensive cases: the fields are defaulted rather than trusted on the way in (a response predating them would otherwise render "undefined changes since Version undefined"), and a *failed* load resets to no-drift rather than keeping the last count it saw.

`components/editor/specs/specs-view.tsx` (edit): a `SpecDriftNotice` directly under the existing Generate Spec control. `role="status"` and the neutral `rounded-xl border border-surface-border bg-base` well — the same treatment `41`'s apply outcome uses. **At zero it renders nothing**, and it adds no second generate button; it exists to explain why the one above it is worth pressing.

`components/editor/changes/changes-view.tsx` (edit): one line added to `41`'s apply outcome — that the spec no longer describes this build list, and where to go. Unconditional, and that matches what the Specs view counts: drift follows from the change having been applied, not from how many units it happened to create.

### Documentation Updated

- `context/architecture-context.md`: a new `## Spec Drift` section after `## Applying A Change`, carrying the derived-not-stored reasoning, why "current" is read from the rows, why it rides on the listing route, and why `40`'s no-spec refusal is deliberately *not* widened to a stale one.
- `context/ui-context.md`: the drift notice under Specs (including why it takes the status treatment and not a warning colour — the opposite call from the stale-change notice, for a stated reason), and the added apply-outcome line under Changes.

### New Scripts

`scripts/verify-spec-drift.ts` (new), wired as `npm run verify:drift`. Eight phases against the real Postgres and Blob store, no model call. Every project it creates is prefixed `verify-spec-drift-` and deleted in a `finally`, including on failure.

## Deviations From The Spec

- **`currentSpecVersion` is `number | null` on the wire, not a plain number.** The spec said "both are plain numbers", meaning no ids travel — which holds. But a project with no specs has no current version, and the alternative was a `0` sentinel standing for "no spec". `null` matches what `currentSpecVersionOf` has always returned and keeps the absence honest; the client only reads the number when the count is above zero, where it is never null.
- **The spec's step 8 asked for the architecture note "under Change Proposals".** It landed as its own `## Spec Drift` section immediately after `## Applying A Change` instead — drift is created by an apply, not by a proposal, and the surrounding sections are already one-topic-each.
- **A verification script was added, which the spec did not ask for.** Units 38–41 each shipped one and the "Check When Done" list is mostly behavioural; asserting those by reading the diff would not have been verification.
- **Both surfaces point at the canvas, not at Generate Spec.** The spec's steps 6 and 7 asked them to say that regenerating brings the spec up to date. That instruction is false in the system as built — see below. This is the one deviation that changes what a user is told to do, rather than how it is built.

## The Instruction The Spec Asked For Is False

The spec dictated the notice copy: *"regenerating brings the spec up to date."* It does not, and this was caught by checking `lib/spec-agent/generate.ts` before shipping the copy.

A spec is written from the **canvas graph, the conversation, and the brief**. The build list is not an input to it at any point. Applying a change writes build units and — by `41`'s explicit design — never touches the canvas or the Liveblocks room. So the sequence the spec's copy invites is:

1. Apply a change. Build units appear. The canvas is unchanged.
2. The notice says regenerating brings the spec up to date.
3. Generate. The model reads the same canvas as before, so the new spec **describes the same system the old one did** and misses the applied work entirely.
4. The new spec takes a higher version, so **no `APPLIED` change has a base equal to the current version any more, and the count derives to zero**. The notice disappears.

The end state is worse than not shipping the notice: the drift indicator now reads *resolved* over a spec that resolved nothing, and it took a deliberate user action to get there. An indicator that can be cleared without fixing what it measures is an indicator that lies.

The count itself is correct and worth having — "this spec is older than N applied changes" is a true and useful statement, and it is exactly what the derivation measures. What was wrong was only the remedy. Both surfaces now name the canvas as the step that has to happen first, and the reasoning is recorded in `architecture-context.md` (`## Spec Drift`, final bullet) and `ui-context.md` (Specs), so the copy cannot drift back without someone reading why.

**This is the tracker's second open question, reached from the UI for the first time.** It was filed before this unit existed and is now the blocking dependency for the drift loop rather than a general concern: once an applied change reaches the canvas through the existing design path, the notice can say "regenerate" and be right. Until then drift is countable but only manually resolvable.

## Verification Actually Run

- **`npx tsc --noEmit`**, **`npx eslint .`**, **`npm run build`** — all clean.

- **`git status prisma/` is empty** — no column, no table, no migration, confirming the central design claim rather than asserting it.

- **`npm run verify:drift -- all` — 31/31 checks passed** against the real Postgres and Blob store:
  - `none`: a project with no specs counts `0` and reports a `null` version rather than erroring; a project with a spec but no applied changes counts `0` against its real version.
  - `applied`: one applied change counts `1`, measured against the current version.
  - `two`: two applies without regenerating count `2`, not `1`.
  - `regenerate`: the count is `1` before generating and `0` after, and the reported version advances to the new spec.
  - `older`: with one change applied against v1 and another against v2, **only the v2 one is counted** — and both are confirmed genuinely `APPLIED`, so the exclusion is proven to be by version rather than by status.
  - `status`: a `PROPOSED` change and a `DISCARDED` change together count `0`, and the *same project* counts `1` the moment one is applied — so the zero is the status filter working, not the fixture failing to build.
  - `deleted-spec`: with the newest spec removed, the counter and the surviving rows are confirmed to genuinely disagree, `currentSpecVersionOf` resolves to the surviving spec, and the drift reappears against it. This is the one case where `nextSpecVersion - 1` would give the wrong answer, and it is now covered.
  - `cross-project`: project B counts `0` and reports its own version while project A counts `2`.

- **Fixture cleanup confirmed**: after a mid-run crash (below) and the full passing run, a direct query for projects named `verify-spec-drift-%` returned **0 rows** — the `finally` cleanup holds even on an uncaught throw.

- **Regression**: `npm run verify:spec-versions -- all` (unit 39) still passes in full, including its read-only backfill check over every pre-existing spec row.

## Not Verified — Be Explicit

- **The browser.** Nothing this unit renders has been seen: not the notice at one change, its plural at two, its absence at zero, not the added apply-outcome line, and not the notice's contrast in situ. This is the **same gap `41` carries**, and both are now dispatchable in one pass — see [`context/plans/browser-verification-40-41.md`](../plans/browser-verification-40-41.md), which should be extended to cover this unit rather than a second plan being filed.
- **The HTTP layer.** No route-level check was run, so three claims are proven only at the library layer: that `GET /specs` actually carries the two fields in a real response body, that it **still** omits `filePath` now that the body has changed shape, and that a signed-out or non-member caller gets neither the numbers nor confirmation the project exists. The guard is unchanged (`withProjectMember`) and the fields are computed inside it, but "unchanged" is an argument, not a check.
- **The collaborator path** — still inherited from unit 38's gap; needs a second Clerk account. See [`context/plans/collaborator-account.md`](../plans/collaborator-account.md).
- **Concurrency between an apply and a generation.** The count is a read of two tables at one moment; a spec generated *during* an apply could in principle be counted against either version. Nothing was raced to find out. The consequence is a number that is briefly off by one on a surface that has no side effects, which is why it was not chased.

## Session Note — Not This Unit's Bug

The first full run of `verify:drift` died in `saveProjectSpec` with Prisma `P2028`: an interactive transaction timing out at 5000 ms after **16636 ms** had passed. The blob upload is correctly *outside* that transaction — it is two DB statements against a remote Postgres, and the wall time was network latency, not work.

It is not this unit's code and not a regression: `verify:spec-versions` (unit 39, untouched here) passed in full immediately afterwards, and the identical `verify:drift` run passed on retry. Recorded because it will look like a spec-drift failure the next time it happens, and because a 5 s interactive-transaction default against a remote database is thin — if it recurs, `saveProjectSpec`'s `$transaction` taking an explicit `timeout` is the fix, and it belongs to unit 27's code rather than this one.

### Follow-up — 2026-08-16 — Browser pass

Driven in a real signed-in browser against seeded fixtures, in the same session that closed unit
`41`'s browser gap. Everything this unit renders has now been seen.

**The notice behaves as designed, in the order that matters.** Checked *before* applying anything,
the Specs view showed **no notice at all** — absence at zero is the design, and a notice there
would have been the bug. After applying one change it read:

> 1 change applied since Version 1.
> This spec predates that work. Specs are written from the canvas, and applying a change doesn't
> update it — add the change to the canvas first, or a new spec will miss it too.

Singular "1 change" (not "1 changes"), and "Version 1" matched what the spec list itself showed.
It sat directly under the Generate Spec control, in a bordered well with the count line in primary
text over muted body text — **no red, no alert icon, no error treatment** — and both tones were
legible against the well. That styling was the point: nothing has failed, and this had to look
unlike the stale-change notice, which in the same pass rendered with red text and an alert icon
because there a request genuinely *was* refused. The two now visibly mean different things.

**The corrected copy survived to the screen.** The apply outcome's added line rendered verbatim as:

> The spec no longer describes this build list. Specs are written from the canvas, which this
> didn't change — add it there before generating a new spec, or the new one will miss it too.

Both surfaces point at the **canvas**, not at Generate Spec. This was the single most important
thing to confirm, because it is the deviation this unit took from its own spec — had the original
"regenerating brings the spec up to date" wording survived, the notice would actively mislead.

**Not verified, and why:**

- **The plural at two.** "2 changes" was never rendered. Reaching a second applied change needs a
  second proposal, which is a model call and fresh fixture state; the pass did not invent it. The
  plural branch is proven only by the 31 library checks and by reading the ternary.
- **The HTTP layer**, unchanged from the original entry: that `GET /specs` really carries the two
  fields in a response body, still omits `filePath`, and refuses a non-member. The browser
  exercised that route as a signed-in owner and the numbers were right on screen, which is
  evidence the fields travel — but it is not a check of the body, and it says nothing about the
  non-member path.
