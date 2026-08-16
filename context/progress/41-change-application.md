# 41 — Change Application

Spec: [`context/feature-specs/41-change-application.md`](../feature-specs/41-change-application.md)

Accepting a proposal from unit 40 updates the build list: the proposed units are created, and the existing units the change makes stale are **marked superseded without being rewritten** — an already-shipped unit still reads `shipped`, because it was. That last property is the whole point of the unit; every comparable tool surveyed in `context/context-improvment.md` either overwrites a completed item or ignores it.

**No model call anywhere in this unit.** It consumes the proposal document unit 40 already stored, so the exhausted/replaced-key question never arises.

## What Shipped

### Schema and Migration

`prisma/models/project-build-unit.prisma` (edit): Added `changeId String?` (the change that produced this unit) and `supersededByChangeId String?` (the change that made it stale), both relating to `ProjectChange` with **`onDelete: SetNull`** — the reason unit 39 gives for `specId`: a build unit is human-owned tracked work and must never be deleted because an artifact referencing it was. Added `CHANGE` to `BuildUnitSource`.

Two relations between the same pair of models must both be named, so they are `ChangeCreatedUnits` and `ChangeSupersededUnits`, with `createdUnits` / `supersededUnits` back-relations on `ProjectChange`.

The doc comment states explicitly that no route deletes a `ProjectChange` row today (unit 40's `DELETE` discards by status), so `SetNull` is a **database-level guarantee rather than a reachable path** — written down so a future delete route inherits the rule instead of rediscovering it.

The model's header comment grew from "two properties a later change must not undo" to three. The third is the invariant: **supersession is not a status.** There is no `SUPERSEDED` member of `BuildUnitStatus` and none may be added — it is a third axis orthogonal to both existing vocabularies, exactly as unit 38 keeps `status` and `verified` orthogonal to each other. A unit can read `shipped` / `browser` / superseded at once and all three are true.

Migration `20260731180000_add_change_application` (new): purely additive — one enum value, two nullable columns, two foreign keys. Generated with `prisma migrate diff --from-config-datasource --to-schema prisma --script -o <file>` (the `-o` flag, per unit 40's note about stdout redirection capturing dotenv's banner) and applied with `prisma migrate deploy`.

### Server Library

`lib/changes/apply.ts` (new): the whole behaviour in one transaction. Loads the change (scoped `{ id, projectId }`), refuses a non-`PROPOSED` one, refuses a stale one, reads the stored proposal from Blob, then transacts:

1. Flips the change to `APPLIED` **with the `PROPOSED` requirement in the `UPDATE`'s own `WHERE`**. That is the guard that actually holds against a concurrent double apply: under read-committed isolation Postgres re-checks the `WHERE` after taking the row lock, so two racing applies resolve to one match and one zero, and the loser rolls back having written nothing. The pre-transaction status check exists only to give a clean answer without opening a transaction.
2. Increments `Project.nextBuildUnitSequence` **once by N**, taking the same `Project` row lock `createBuildUnit` relies on, and assigns from the reserved block.
3. Reads the project's existing keys *under that lock*, so the collision set cannot move under the insert.
4. Checks the cap against what will **actually** be created, after collisions are removed — refusing on units that would have been skipped anyway would be a refusal about nothing.
5. Inserts each unit as `SPECCED` / `NONE` / `source: CHANGE` / `changeId` set.
6. `updateMany`s `supersededByChangeId` onto the impact set — **one column**, scoped to the project. No `title`, `summary`, `status`, `verified`, or `sequence` appears in that `data`.

`lib/build-units.ts` (edit): `SOURCE_TO_WIRE` gained `CHANGE: "change"`; `UNIT_SELECT` gained `supersededByChange: { select: { sequence: true } }`; `toSummary` maps it to a number. `UNIT_SELECT`, `BuildUnitRow`, and `toSummary` are now exported so the apply module reuses one definition of the read shape rather than declaring a second. `BuildUnitUpdate.supersededByChangeId` is typed **`null`, not `string | null`** — setting it is not expressible in the lib at all.

### HTTP Routes

`POST /api/projects/[projectId]/changes/[changeId]/apply` (new): `withProjectMember`, answering with the created units, the superseded ids, and the skipped titles. The optional `acknowledgedSpecVersion` in the body is the only thing accepted from a client, and it is validated against the project's real current version rather than trusted — an acknowledgement of any other number refuses exactly as an absent one does. A non-integer value is treated as absent rather than a 400, because it can never turn a refusal into a pass.

The stale refusal answers 409 with **its own body shape** (`{ error, stale: { baseSpecVersion, currentSpecVersion } }`) rather than a bare `{ error }`, because it is the single refusal a person can resolve and the client has to be able to tell it apart from the terminal ones. The message names both versions on its own, so a client that only reads `error` still says something true.

`PATCH /api/projects/[projectId]/build-units/[unitId]` (edit): accepts `supersededByChange: null` to clear. **Any other value answers 400** rather than being quietly treated as a clear — a caller that sent a number should hear that it cannot, not have it happen anyway. Combined with the lib's `null`-only type, no request can set supersession.

`DELETE /api/projects/[projectId]/changes/[changeId]` (edit): now scoped `status: { not: APPLIED }`, so an applied change cannot be discarded — its effects stand, so recording it as rejected would be false. Zero matched rows triggers one scoped existence read to answer 409 (exists, applied) rather than 404 (does not exist here), and that read only happens on the refusal path.

### Wire Types

`types/build-units.ts` (edit): `BuildUnitSummary.supersededByChange: number | null` — the change's **sequence**, not its id, following the same "return only what the client renders" discipline that sends `specVersion` instead of `specId`. Source union gained `"change"`. There is deliberately **no** wire field for `changeId`: `source: "change"` already says a unit came from applying a proposal, and nothing renders *which* one.

`types/changes.ts` (edit): `ChangeApplyResponse` and `ChangeStaleRefusal`. This module now has one import — `BuildUnitSummary` from the sibling wire-type module — which is still nothing from `lib/` or the generated Prisma client.

`hooks/use-project-changes.ts` (edit): `apply(changeId, options?)`. Its result is a **three-member discriminated union**, with `stale` as its own member carrying the two versions: expressing the distinct actionable state in the type rather than by parsing prose is what the spec asks for. The stale body is read off a `clone()` so the fallback `readErrorMessage` still has the stream, and both numbers are shape-checked rather than trusted. On success the local row's status flips to `applied` rather than refetching.

`hooks/use-project-build-units.ts` (edit): `BuildUnitPatch.supersededByChange?: null`.

### UI Components

`components/editor/build/build-unit-row.tsx` (edit): a fourth badge, "replaced by change {n}", after the status, verification, and source-spec badges, in the same house treatment at `text-copy-muted`. The expanded panel gains one control, "Not superseded", serialized through the same single `pendingAction` as every other mutation in the row.

`components/editor/build/build-view.tsx` (edit): comment only — the list is rendered exactly as the server ordered it, and the no-reorder / no-hide / no-dim rule is stated at the render site so it is greppable where the change would be made.

`components/editor/changes/changes-view.tsx` (edit): Apply beside Discard on an expanded `proposed` change; a settled outcome line and no actions on an applied or discarded one. `StaleNotice` renders inside the proposal body, names both versions, and **replaces** the Apply button while it is on screen, so there is exactly one way forward. `ApplyOutcome` reports created / superseded counts and the skipped titles by name.

### Documentation Updated

`context/architecture-context.md`: the two new `SetNull` columns under the storage model; supersession as an axis independent of `status` under Build Units; the apply route added to the change-proposal route list; an "Applying A Change" section; and the applied-cannot-be-discarded rule.

`context/ui-context.md`: the supersession marker and its no-dim/no-reorder rule under Build; the Apply control, the stale confirmation and its alert-treatment reasoning, and the outcome report under Changes.

### New Scripts

`scripts/verify-change-application.ts` → `npm run verify:apply` — library/database layer, no model call, hand-authored proposal fixtures, throwaway `verify-change-application-` projects deleted in a `finally`.

`scripts/verify-change-application-http.ts` → `npm run verify:apply-http` — route layer, driving the real dev server with a Clerk session token minted through the Backend API (the transport unit 38's HTTP script established). It seeds with Prisma rather than over HTTP because the state an apply needs includes a **stored proposal**, which can only be created through the API by spending a model call this unit is required not to make.

## Deviations From The Spec

- **`lib/changes/apply.ts` sits alongside the existing flat `lib/changes.ts`.** The spec named this path and it is what shipped; both resolve correctly (`@/lib/changes` → the file, `@/lib/changes/apply` → the directory). Worth knowing it is a directory shadowing a module's basename, which is legal but reads oddly — if it ever bites, `lib/change-apply.ts` is the rename.
- **The build-row work landed in `build-unit-row.tsx`, not `build-view.tsx`.** The spec's step 9 named the view; unit 38 had already split the row into its own file, and badges and per-row controls live there. `build-view.tsx` got the no-reorder rule as a comment at the render site.
- **Two checks were added that the spec implied rather than listed**: the `DELETE` refusal for an applied change (its "Check When Done" requires it but no implementation step assigned it), and a refusal for a change whose stored proposal cannot be read — applying that would mark a change `APPLIED` for having done nothing, so it answers 409 and leaves it `PROPOSED`.

## Verification Actually Run

- **`npx tsc --noEmit`**, **`npm run lint`**, **`npm run build`** — all clean.

- **`npm run verify:apply -- all` — 59/59 checks passed** against the real Postgres and Blob store:
  - `creates`: proposed units land at the end with sequences above every existing one and contiguous within the reserved block, each `specced` / `none` / `change`; no existing unit renumbered; the change becomes `APPLIED`; **no spec was created**.
  - `preserves`: every pre-existing unit **byte-identical** across title, summary, status, verification, sequence, source, `specId`, and `createdAt`; a unit that read `SHIPPED` / `BROWSER` still reads `SHIPPED` / `BROWSER` **and** carries the marker; the marker resolves to the change's *sequence*; a unit outside the impact set is not marked; no status was rewritten.
  - `twice`: the second apply is refused `not-proposed`, creates nothing, changes nothing, and burns no sequence numbers.
  - `stale`: refused with both versions named; the refusal changed nothing and left the change `PROPOSED`; acknowledging the *stale* version is still refused; confirming with the current version applies it.
  - `duplicate`: a proposed unit whose title matches an existing one is skipped and reported by title, the existing unit is untouched, and no second unit with that title exists.
  - `cap`: at 199 units a two-unit change is refused whole — nothing created, nothing marked, change still `PROPOSED`, **and the reserved sequence block rolled back with it**.
  - `clear`: clearing supersession leaves the unit otherwise byte-identical and the change untouched.
  - `set-null`: deleting a `ProjectChange` leaves every unit it created and superseded standing with both links nulled, and `source` survives the null-out.
  - `discarded`, `cross-project`: both refused, both changed nothing.

- **`npm run verify:apply-http -- all` — 36/36 checks passed** against a running dev server with a real Clerk session (transport resolved as `Authorization: Bearer`):
  - `apply`: 200; two units created, both `specced` / `none` / `change`; two superseded ids; nothing skipped. The **raw response bytes** were searched and contain no `proposalPath`, `baseSpecId`, `supersededByChangeId`, `changeId`, `"key"`, or blob URL. Read back through `GET /build-units`, superseded units still read `shipped` / `browser` with `supersededByChange: 1`, and no existing unit was renumbered.
  - `twice`: 409 with "This change is no longer open — it has already been applied or discarded."; created nothing.
  - `discard-applied`: `DELETE` answers 409 and the change is still `applied`.
  - `stale`: 409 carrying `{"baseSpecVersion":1,"currentSpecVersion":2}`; message names both; acknowledging the stale version still 409; confirming with the current version 200 and creates the units.
  - `no-set`: `PATCH` with `99` → 400, with a change id → 400, build list byte-identical after both; with `null` → 200, unit reads unsuperseded and is otherwise unchanged (`shipped`, `browser`, same title, same sequence).
  - `cross-project`: 404 through a project the caller genuinely belongs to; that project's build list byte-identical afterwards; the other project's change still `proposed`.
  - `signed-out`: 401, body is `{"error":"Unauthorized"}` and contains neither the project id nor the change id, build list unchanged, change still `PROPOSED`.

- **Regression**: `npm run verify:changes -- all` (unit 40) still passes in full.

## Not Verified — Be Explicit

- **The browser.** No React rendering of the Apply button, the stale confirmation, the outcome report, or the supersession badge and clear control was observed — no browser QA pass was run for this unit. The behaviour behind all of it is proven at the route layer with real HTTP and real bodies, but the rendering, the pending states, focus behaviour, and the badge's contrast in situ are unproven.
- **A genuine mid-transaction crash.** "A failure partway through leaves the build list and the change status exactly as they were" is proven via the cap sentinel and the `not-proposed` sentinel, which roll back the same transaction at two different points — but not via an arbitrary failure at an arbitrary statement.
- **Concurrent applies at the HTTP layer.** The double-apply guard is proven sequentially (second request → 409) and by construction (the `status` requirement inside the `UPDATE`'s `WHERE`), not by two simultaneous requests racing.
- **The collaborator path** — still inherited from unit 38's gap; needs a second Clerk account. A non-owner member applying a change, and a non-member getting 404, are both unproven.
- **The Liveblocks and canvas scope limits** are argued rather than observed: nothing in this unit's code path imports or writes to the room, and no `ai-status-feed` / `ai-chat` publish exists in it, but no live room was watched during an apply.

### Follow-up — 2026-08-16 — Browser pass

The gap this file opened with ("no browser pass at all") is now closed. Driven in a real signed-in
browser against seeded fixtures, on the plan in `context/plans/browser-verification-40-41.md`.

**The central visual claim holds.** A superseded row renders `SHIPPED` · `BROWSER` · `FROM V1` ·
`REPLACED BY CHANGE 1` — **all four badges at once**, left to right in that order. A non-superseded
row shows only the first three, so the supersession badge appears exactly where it is earned.
Superseded rows stayed in their original positions, undimmed, uncollapsed, unhidden, and the two
created units landed at the end of the list reading `SPECCED`/`NONE`. The skipped duplicate was
untouched. This is the one claim the library and HTTP harnesses structurally could not make.

**The crowding question is answered — it is not crowded.** At 1280px all four badges sit on one
line with roughly a third of the card width still free; at ~900px they still fit with ~90px spare;
at ~700px with the sidebar closed, ~220px spare, text crisp and unwrapped. No width tested made
the row wrap.

The plan's framing of this question was wrong in two ways, recorded so the next reader does not
look for what is not there: it asked about **"four badges plus a date"**, but a build row carries
no date at all — collapsed or expanded. And the first attempt could not answer it, because the
fixture seeded units with no `specId`, so the `FROM V1` badge never rendered and only three badges
were on screen. A three-badge row proving comfortable says nothing about the four-badge one; the
fixture was corrected and the pass re-run.

**Everything else checked out.** Apply and Discard both present with Apply on the primary
treatment; the outcome reporting created/superseded counts with correct plural agreement and
naming the skipped title; both actions replaced by the settled line afterwards with the badge
flipping to `APPLIED`; exactly one `POST /apply`, 200, no retry. The stale change refused with
409, surfaced a notice naming **both** versions in prose, removed the plain Apply button so its
confirm ("Apply anyway against v2") was the only way forward, and fired exactly once with no
automatic retry. Delta kinds rendered as neutral badges, not a green/red diff palette.

#### One real bug, found and fixed

The expanded superseded row rendered **"Change 1replaced this unit's work."** — no space. The
source read correctly (`Change {unit.supersededByChange} replaced …`), so this was only ever
visible in painted pixels; the accessibility tree and a source reading both looked fine, and it
took an enlarged screenshot to catch.

The cause is narrow and worth stating precisely, because the obvious generalisation is wrong. The
text node following the expression begins with a space and wraps onto the next source line, **and
contains an HTML entity** (`&apos;`). Next's SWC compiler trimmed its leading space, emitting
`["Change ", value, "replaced …"]`. The sibling construction in `changes-view.tsx` — same
expression-then-space-then-wrapping-prose shape but **no entity** — compiles correctly, emitting
`," skipped — the build list …"`, and renders with proper spacing (confirmed at the pixel level in
the same pass). esbuild preserves the space in both cases, so this is an SWC behaviour, not a JSX
rule.

Fixed with an explicit `{" "}` and a comment at the site. Verified in the production chunk, which
now emits `["Change ", a.supersededByChange, " ", "replaced …"]`, and then re-verified in the
browser: the gap between "1" and "replaced" is now indistinguishable from the gaps around it.

Every `.tsx` was scanned for that exact trigger shape — an expression followed by a space, then
prose that both spans lines and contains an entity. **Zero remaining instances.** It was a one-off,
not a class.

#### Still not verified

- **The transient "Applying…" state.** The request settled before a snapshot could be taken, so the
  pending spinner was never observed — only the correct settled state after it.
- **The collaborator path**, unchanged: still needs a second Clerk account.
- **A hover treatment on the build row.** A pixel diff of hover against rest showed *zero*
  difference, which would contradict `ui-context.md`'s claim that badge contrast holds "under the
  row's `hover:bg-elevated`". `hover:bg-elevated` **is** present on the header button
  (`build-unit-row.tsx:284`), and the diff was taken on an already-expanded row, so this is most
  likely a mis-targeted hover rather than a regression. Recorded as unresolved rather than assumed
  either way — it needs one deliberate check on a *collapsed* row.
