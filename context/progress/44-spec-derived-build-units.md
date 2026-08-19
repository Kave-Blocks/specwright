# 44 — Spec-Derived Build Units

`41` gave the change path an automatic producer and left the initial path without one. Specwright
would generate five units when asked for offline mode, and the original twenty were still typed by
hand — the asymmetry sitting at the top of the tracker's open questions since `38` deferred it.
This closes it: a project's current spec becomes the first set of build units it implies, in one
explicit action.

## What Shipped

**No migration.** `ProjectBuildUnit.specId` and `BuildUnitSource.SPEC` already existed — the
lineage column `39` added, and an enum member that had been reserved for this producer since `38`
with nothing writing it. `39`'s rule (*record a fact already true, not one that anticipates a
relationship*) had already put both in place; this unit is the case they were put there for.

**`lib/unit-agent/payload.ts`** — the three schemas, in `lib/` rather than the task module so the
route validates against the same shapes without pulling the AI SDK into the request bundle. The
client request is `roomId` **and nothing else**: not the spec, not its id, not the unit list.
`MAX_DERIVED_UNITS = 40` bounds what the model may return — a runaway guard well under
`MAX_BUILD_UNITS`, so one derivation can never consume a project's whole ceiling.

**`lib/unit-agent/derive.ts`** — context load, prompt, one `generateObject` call. Its own
`UNIT_MODEL`, so the three AI paths stay independently raisable. The prompt shows the existing
units so the model can avoid repeating them, and the module says outright that this is how a
*better* answer is produced, not how the system stays correct — the producer drops a colliding key
in code regardless.

**`lib/unit-agent/produce.ts`** — the producer, and the module the whole unit turns on. It is
`38`'s contract implemented a second time and the first time against *model output*:

- **Only adds.** No supersession, no edit, no delete. `supersededByChangeId` needs a change to
  point at and a derivation has none, so marking a unit stale is not expressible here at all.
- **`status`, `verified`, `sequence` are set here, never from what the model returned.**
- **A key collision is a no-op**, which is also what makes a second derivation write nothing.
- Untitled entries are dropped through the same `normalizeUnitTitle` a person's title passes, and
  the drops are **counted** separately from skips — they are different facts.

The transaction is `lib/changes/apply.ts`'s ordering step for step, with its reasoning carried
across. The one difference is what is absent: `apply.ts` ends by marking its impact set superseded,
and there is no step 6 here.

**`trigger/derive-units.ts`** — durable task shaped like `trigger/propose-change.ts`. Progress on
the **run's metadata**, not `ai-status-feed`: a build list is "the one project resource with no
second layer", so it follows the spec and proposal path rather than the broadcast path. Every
refusal is an `AbortTaskRunError`; quota exhaustion goes through the existing
`isQuotaExhaustedError`.

**`app/api/ai/units/route.ts`** and **`token/route.ts`** — mirroring `app/api/ai/change/` and
`app/api/ai/canvas/token/`. The no-spec 409 is answered **before** the run is triggered, so a
request that cannot succeed never spends a model call.

## Deviations From The Spec

**The task refuses when the spec moved under the run, which the spec did not ask for.** The route
resolves `specId` from the project's current spec; between that and the run, a newer spec can be
generated. Writing the units anyway would attribute them to a spec that is no longer current —
lineage that is quietly false. The task re-reads the current spec and aborts if the id differs.
This is `41`'s staleness refusal in a second place, for the same reason: a delta whose base moved
cannot be silently reinterpreted. It costs one extra query on a path that has already made a model
call.

**`readSpecMarkdown` was extracted rather than copied.** It was private to
`lib/change-agent/propose.ts`; this unit reads the same bytes. It moved to `lib/spec-agent/storage.ts`,
beside the function that writes them. Two readers of one artifact is how two different policies for
an unreadable spec come to exist — and the policy matters here, because both callers reason
*against* the spec, so degrading to an empty string would produce a confidently wrong answer rather
than a weaker one. `propose.ts`'s behaviour is unchanged. This is the same call `43` made extracting
`lib/design-agent/room.ts`.

**No "already derived" column was added, and the absence is the design.** The obvious shape is a
`unitsDerivedAt` mirroring `43`'s `canvasPushedAt`. It would be wrong here: `43` needed one because
a CRDT document has no memory of which change produced which node, so nothing already existing said
a push had happened. Here the build list *is* the record — every derived key already exists, so a
second derivation skips everything on its own. The idempotency is the collision.

## Scope Limit, Taken Deliberately

**There was no UI.** `ai-workflow-rules.md` says to split a step that combines UI changes and
background-task changes, and the spec path was split exactly this way across `27` (backend), `28`
(persistence), and `29` (UI). So this unit ended at the route, and nothing in the product called
`POST /api/ai/units` — the capability was reachable over HTTP and by the verification script, and
by nothing a person could click.

**Closed 2026-08-19 by unit [`46`](46-derive-units-ui.md)**, which is this route's caller: the
Derive control on the Build tab, primary while the build list is empty and quiet beside the add
form once it has units, reporting created, skipped, and dropped separately. The route and the
token route were both exercised over real HTTP from a signed-in browser session there (`200` on
each). What `46` could **not** close is the item below — the task still has never run in a worker,
so a started run stays queued and no derivation has ever completed.

## Verified

`npm run verify:units -- all` — **43 checks, all passing**, against the real Postgres and the real
Blob store, with no model call anywhere in it. That absence is deliberate and is the same argument
`43` made: the two things this unit must never get wrong — that a human-owned column is never
written from model output, and that an existing unit is never touched — are both decided *after*
the model has spoken. Hand-authored input proves the producer holds regardless of what the model
emits, which watching one good run could never do.

- `derive` — units land with `source: spec`, the spec's version as lineage, `specced`/`none`, an
  omitted summary stored as `null` rather than `""`, consecutive numbering from the reserved block,
  and nothing superseded.
- `contract` — a colliding title is skipped and reported, and the existing unit is checked **column
  by column**: status, verification, sequence, title, summary, source, `specId`, and supersession
  all unchanged. Asserted individually rather than as one deep-equal, so a future producer that
  starts writing one column fails on the line naming it.
- `idempotent` — deriving the same set twice creates nothing the second time and reports both
  titles as skipped.
- `untrusted` — blank and whitespace-only titles are dropped and counted, the rest of the batch
  still lands, and a drop is asserted *not* to be reported as a skip.
- `cap` — a derivation past `MAX_BUILD_UNITS` is refused whole, nothing is created, and the
  reserved sequence block is proved to have rolled back.
- `no-spec` — the context loader refuses before a model call could be spent, and the positive case
  is asserted too (the spec's real Markdown read back out of Blob), so the refusal cannot pass for
  the wrong reason.

**`npm run verify:db` — 253 checks across all six suites, zero failures**, so this unit did not
silently break an earlier one. `npm run build` passes with both new routes registered
(`/api/ai/units`, `/api/ai/units/token`); `npx tsc --noEmit` and `npm run lint` are clean.

## Not Verified

Nothing below was checked, and none of it is claimed to work.

- **The model.** Whether a real spec yields sensible units — the right granularity, a workable
  order, no invented scope — is not something a script can assert. The producer is what guarantees
  the derivation cannot do harm; nothing guarantees it does good. This is the same honest limit
  `43` records for its own prompt.
- **The whole HTTP layer.** The route's 409, its 404 masking, the signed-out and non-member paths,
  and the token route's 404/403 are unexercised — there is no `verify:units-http` counterpart to
  `verify:apply-http`.
- **The task has never run.** No `trigger dev` or `trigger deploy` has picked up `derive-units`, so
  the payload schema, the metadata phases, and the spec-moved refusal are unobserved in a worker.
- **The spec-moved refusal specifically.** It is the one deviation this unit added, it needs a
  second spec generated mid-run to observe, and the verification script cannot reach it — it tests
  the producer, and the refusal lives in the task.
- **The browser**, as far as *this* unit goes — it shipped no UI. Its caller, unit
  [`46`](46-derive-units-ui.md), was browser-verified on 2026-08-19 as far as a queued run allows:
  the control's states and both HTTP requests were observed, and every outcome state was not.
- **The collaborator path**, which needs a second Clerk account — the same gap `38`, `41`, and `43`
  carry.
