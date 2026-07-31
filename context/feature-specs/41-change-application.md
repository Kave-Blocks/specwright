Accepting a proposal from unit `40` updates the build list: the proposed units are created, and the existing units the change makes stale are **marked superseded without being rewritten** — an already-shipped unit still reads `shipped`, because it was.

That last property is the point of the unit. Every comparable tool surveyed in `context/context-improvment.md` either overwrites a completed item or ignores it; none records "this was built, and then it was replaced."

## Implementation

Units `38`, `39`, and `40` must be shipped first.

1. `prisma/models/project-build-unit.prisma` — the two columns this unit writes.
   - Add `changeId String?` — the change that produced this unit — relating to `ProjectChange` with `onDelete: SetNull`.
   - Add `supersededByChangeId String?` — the change that made this unit stale — relating to `ProjectChange` with `onDelete: SetNull`.
   - Add `CHANGE` to `BuildUnitSource`, alongside `MANUAL` and `SPEC`.
   - `SetNull` on both, for the reason `39` gives for `specId`: a build unit is human-owned tracked work and must never be deleted because an artifact referencing it was. No route deletes a `ProjectChange` row today (`40`'s `DELETE` discards by status), so this is a database-level guarantee rather than a reachable path — state that in the doc comment so a future delete route inherits the rule instead of rediscovering it.
   - These columns belong here, not in `40`, by the rule `39` established: `40` writes neither, so in `40` they would record nothing. Add a column that records a fact already true.

2. `prisma/models/project-build-unit.prisma` — the invariant, doc-commented.
   - **Supersession is not a status.** Do not add `SUPERSEDED` to `BuildUnitStatus`. `38` already records that `status`, `verified`, and `sequence` are human-owned and no automatic producer may write them; a supersession status would break that, and it would overwrite `shipped` — destroying the record of what was actually built, which is the exact failure this unit exists to avoid.
   - Supersession is a **third independent axis**, orthogonal to both existing vocabularies, the same way `38` deliberately keeps `status` and `verified` independent. A unit can read `shipped` / `browser` / superseded, all at once, and each is true.
   - Generate and apply the migration, with the `05-prisma.md` fallback if the shadow-database step fails.

3. `lib/changes/apply.ts` — the whole behavior, in one transaction.
   - Load the change, its impact rows, and its stored proposal document.
   - **Refuse a change that is not `PROPOSED`.** An applied change re-applied would duplicate work; a discarded one was rejected on purpose.
   - **Refuse a stale change.** If the change's `baseSpecId` is not the project's current highest spec version, the proposal was reasoned against an older picture of the system. Answer 409 carrying the base version and the current version, and require the caller to re-submit acknowledging the current one. This is IcePanel's merge-conflict step reduced to a single branch; the canvas is collaborative and *will* move under a pending proposal.
   - Create the proposed units at the **end** of the list: `status` `SPECCED`, `verified` `NONE`, `source` `CHANGE`, `changeId` set. Reserve the numbers by incrementing `Project.nextBuildUnitSequence` **once by N** and assigning from the reserved block, rather than incrementing N times.
   - Write `supersededByChangeId` on every unit in the impact set. **Do not touch its `title`, `summary`, `status`, `verified`, or `sequence`.**
   - Set the change's `status` to `APPLIED`.
   - All of it in one transaction. A partial apply leaves a build list nobody asked for — half the new work present, half the supersession recorded, and no way to tell which half.
   - A proposed unit whose derived key collides with an existing unit is a **no-op, not an error**: `38` defines `@@unique([projectId, key])` as the natural key an automatic producer matches against, and skipping the collision is the second guard against a double apply if the status check is ever bypassed. Count the skips and return them so the caller can report what did not land.
   - Enforce `38`'s per-project unit cap. A change that would push a project past it is refused whole, not applied partially.

4. `app/api/projects/[projectId]/changes/[changeId]/apply/route.ts` — the endpoint.
   - `POST` applies the change and answers with the created units, the superseded unit ids, and any skipped titles.
   - `withProjectMember` — applying a change is project content, consistent with `40`'s collection routes and with `38`'s reasoning about content versus lifecycle.
   - Scope the read to `{ id: changeId, projectId }` and answer 404 when nothing matched.
   - Accept an optional acknowledged spec version in the body; without it, a stale change is refused. The body is the only place this can come from, and it is a *confirmation of something the server told the client* — validate it against the current version rather than trusting it as an instruction.

5. `app/api/projects/[projectId]/build-units/[unitId]/route.ts` — let a person disagree.
   - `PATCH` gains the ability to **clear** `supersededByChangeId`, and only to clear it. Setting it requires a change to point at, which a person cannot invent, so the only human operation is removal.
   - Clearing changes nothing else about the unit.

6. `types/build-units.ts` — the wire contract.
   - Add `supersededByChange` to `BuildUnitSummary` as the change's `sequence` (not its id), following the same "return only what the client renders" discipline `39` applied to the source spec's version.
   - Extend the source union with `"change"`.

7. `types/changes.ts` and `hooks/use-project-changes.ts` — expose applying.
   - Add `apply` to the hook, applying the server's returned rows to local state rather than refetching.
   - The stale-change refusal must reach the view as a distinct, actionable state, not a generic error string.

8. `components/editor/changes/changes-view.tsx` — the Apply control.
   - An expanded `PROPOSED` change gets an Apply action. An `APPLIED` or `DISCARDED` change shows its outcome and no action.
   - A stale change surfaces the mismatch in the proposal body — which spec version it was reasoned against, which is current — and requires a second, explicit confirmation before applying. Do not auto-retry the refused request.
   - After applying, report what landed: how many units were created, how many were superseded, and any that were skipped as duplicates.

9. `components/editor/build/build-view.tsx` — show supersession on the build list.
   - A superseded unit's row carries a "replaced by change {n}" marker **alongside** its existing status and verification badges, never in place of them. A shipped unit that has been superseded must visibly read both.
   - Expanding the row offers the clear action from step 5.
   - Do not reorder, hide, dim, or collapse superseded units by default. They are the record of what was built.

10. Update `context/architecture-context.md` (the apply route under the membership-gated group, and supersession as an axis independent of `status` under the build-unit model) and `context/ui-context.md` (the supersession marker on a build row).

## Dependencies

Already installed:

- `prisma` / `@prisma/client` 7.8, `next` 16.2.10, `@clerk/nextjs`, `@vercel/blob`

To install:

- nothing

No new environment variables. **This unit makes no model call**, so it does not read `OPENAI_API_KEY` and is not blocked by the exhausted quota.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- The supersession marker reuses the muted badge treatment `38` established for collapsed-row badges (`bg-subtle text-copy-muted`). It sits after the status and verification badges, so a row reads status → verification → supersession in that order.
- The Apply action uses the existing primary control treatment; the stale-change confirmation reuses the error/alert treatment (`role="alert"`, `text-error`) rather than introducing a warning color, which does not exist in the token set.
- Radius scale: `rounded-xl` for inline controls, `rounded-2xl` for cards.
- Component states to cover: Apply (default, pending, disabled on a non-proposed change), stale confirmation (shown, confirmed), build row (superseded and not, expanded and collapsed).

## Scope Limits

- do not make any AI or model call, anywhere in this unit
- do not write a `ProjectSpec` row or generate spec Markdown
- do not mutate the canvas or write anything to the Liveblocks room
- do not write `status`, `verified`, or `sequence` on an existing unit
- do not delete a superseded unit, or edit its title or summary
- do not add `SUPERSEDED` to `BuildUnitStatus`, or make supersession a status anywhere
- do not renumber or reuse a unit's sequence
- do not apply a change that is not `PROPOSED`
- do not let a client set `supersededByChangeId` — only applying a change sets it
- do not re-run the proposal or change what `40` stored
- do not hide, dim, or reorder superseded units in the build list
- do not add a route that deletes a `ProjectChange` row

## Notes

- Read `context/architecture-context.md` and `context/code-standards.md` before implementing; `context/ui-context.md` for the badge tokens.
- `38`'s producer contract is what this unit is written against: match on `key`, no-op on conflict, never write a human-owned column. It was specified before any of this existed and it is what forces supersession onto its own axis.
- The design this closes is named precisely in BMAD-METHOD issue #1930 — mark a completed item superseded, preserve its original text, spawn a new item for the delta — and was unshipped there at the time of the research in `context/context-improvment.md`.
- **Verifying without the quota:** this unit consumes `40`'s stored proposal rather than producing one, so hand-author a proposal document at `changes/{projectId}/{changeId}.json` matching `40`'s schema and apply it. That covers every check below and doubles as the fixture worth keeping.

## Check When Done

- Applying a change creates its proposed units at the end of the build list, each `specced` / `none`, with no existing unit renumbered.
- A superseded unit keeps its title, summary, status, verification level, and sequence exactly as they were.
- A unit that read `shipped` / `browser` before the change still reads `shipped` / `browser` after it, **and** shows the supersession marker.
- Applying the same change twice is refused, and the second attempt creates nothing and changes nothing.
- A change whose base spec is no longer the project's current version is refused, and the refusal names both versions.
- Confirming that refusal with the current version applies the change.
- A proposed unit whose title matches an existing unit is skipped and reported, and the existing unit is untouched.
- A change that would push the project past the unit cap is refused whole — no unit is created and nothing is marked superseded.
- A failure partway through leaves the build list and the change status exactly as they were.
- A person can clear supersession from a unit, and nothing else about that unit changes.
- No request can set `supersededByChangeId` directly.
- A discarded change offers no Apply action, and the endpoint refuses it.
- An applied change cannot be discarded.
- Superseded units stay in their original position in the list and are not dimmed or hidden.
- A change id belonging to a different project cannot be applied through a project the caller does belong to.
- A signed-out caller and a non-member get no data and no confirmation the project exists.
- The canvas is unchanged, and no message appears on `ai-status-feed` or `ai-chat`.
- No spec is created by applying a change; the project's spec version is the same before and after.
- `npm run build` passes without type errors.
