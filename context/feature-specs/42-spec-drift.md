After a change is applied, the project's spec no longer describes the project's own build list. This unit makes that drift **visible and countable** — "2 changes applied since Version 3" — so a member knows the spec is behind and can regenerate it deliberately. It does not regenerate anything on its own.

Unit `41` closed the write half of the change loop: a proposal becomes build units. This closes the read half. Without it, the next proposal is reasoned against a spec that does not contain the work the last one added, so it re-proposes that work — and `41`'s key-collision skip swallows the duplicate silently, reporting "1 unit skipped" with no hint that the real cause is a spec that never caught up.

## Implementation

Units `39`, `40`, and `41` must be shipped first.

1. **No schema change. The drift is already recorded — derive it.**
   - A change stores `baseSpecId`, the version it was reasoned against. A spec version is only ever assigned upward. So a project's spec is behind **exactly when it has at least one `APPLIED` change whose base spec version equals the project's current highest spec version** — if a spec had been generated after that change, the current version would be higher.
   - This is `39`'s rule applied a third time: *add a column that records a fact already true, not one that anticipates a relationship*. A `specStaleSince` column would store nothing the two numbers do not already say, and would need keeping in sync with every apply and every generation.
   - Do **not** add a column, a counter, or a status for this.

2. `lib/changes.ts` — one function, `countAppliedChangesSinceCurrentSpec(projectId)`.
   - Resolve the project's current highest spec version from the spec rows (`orderBy: { version: "desc" }`), not from `Project.nextSpecVersion - 1` — the counter records the last number *assigned*, which differs from the highest that still exists once a spec has been removed. The same reasoning `41`'s staleness check already writes out; reuse it rather than restating it.
   - Count `APPLIED` changes on that project whose `baseSpec.version` equals it.
   - A project with no specs returns `0`, not an error: there is nothing to be behind.
   - Return the count and the current version together — the UI renders both ("2 changes applied since Version 3") and a second round-trip for the second number would be gratuitous.

3. `app/api/projects/[projectId]/specs/route.ts` — expose it on the listing.
   - `GET` gains two sibling fields beside `specs`: the drift count and the current version.
   - **A new route is the wrong shape here.** The one surface that renders this is the Specs view, which already calls this route on mount, so a second endpoint would double the requests to say one number. Ordering, guard, and the `filePath`-never-selected discipline are all unchanged.
   - `withProjectMember`, unchanged.

4. `types/specs.ts` — the wire contract.
   - `ProjectSpecListResponse` gains the count and the current version. Both are plain numbers; no change id and no spec id travels, following the same discipline that keeps `filePath` out of `ProjectSpecSummary`.

5. `hooks/use-project-specs.ts` — carry the two numbers.
   - Expose them alongside `specs`. They are refreshed by the same reload the hook already performs after a generation completes, so generating a spec clears the drift without a second mechanism.

6. `components/editor/specs/specs-view.tsx` — say it where it can be acted on.
   - When the count is above zero, a notice above the list: how many changes have been applied since the current version, and that regenerating brings the spec up to date.
   - It sits beside the **existing** Generate Spec control. Do not add a second generate button; the drift notice explains why the existing one is worth pressing.
   - When the count is zero, render nothing. Absence is the signal, the same rule `38` applied to the source-spec badge — there is no "spec is current" banner to read past on every visit.

7. `components/editor/changes/changes-view.tsx` — close the loop at the point of action.
   - `41`'s apply outcome already reports what landed. Add one line to it: the spec no longer describes the build list, and where to go.
   - This is the moment the drift is *created*, so it is the moment a person is most able to act on it.

8. Update `context/architecture-context.md` (drift as a derived quantity under Change Proposals, with the "no column" reasoning) and `context/ui-context.md` (the notice on Specs, the added line on the apply outcome).

## Dependencies

Already installed:

- `prisma` / `@prisma/client` 7.8, `next` 16.2.10, `@clerk/nextjs`

To install:

- nothing

No new environment variables. **This unit makes no model call.** It counts rows and renders a number; regenerating a spec is the existing unit `27` path, reached by the existing control.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- The drift notice is **informational, not an error**: `role="status"`, and `text-copy-muted` body text in a `rounded-xl border border-surface-border bg-base` well — the same treatment `41`'s apply-outcome report uses. It must not take `text-error` or `role="alert"`: nothing has gone wrong, and a spec being behind is the expected consequence of applying a change.
- Do not introduce a warning colour. `--warning` is registered but already reads as a verification level (`partial`); this is the same call `41` made for its stale notice, in the opposite direction — there the request genuinely failed, so the alert treatment was honest; here nothing failed.
- Radius scale: `rounded-xl` for the notice, `rounded-2xl` for cards.
- Component states to cover: notice (absent at zero, singular at one, plural above one), Specs view with and without an existing spec.

## Scope Limits

- do not add a column, counter, or status recording drift — it is derivable
- do not regenerate a spec automatically, on apply or anywhere else
- do not make a model call anywhere in this unit
- do not add a second Generate Spec control
- do not refuse or block a proposal because the spec is behind — `40` refuses only when there is **no** spec, and widening that refusal would block the exact action that resolves the drift
- do not modify what `41` writes, or add anything to its transaction
- do not change spec ordering, versioning, or the download route
- do not render a notice when the count is zero
- do not add a new API route

## Notes

- Read `context/architecture-context.md` (Change Proposals, Applying A Change, Spec Retrieval) and `context/code-standards.md` before implementing; `context/ui-context.md` for the well and badge treatments.
- `41`'s `currentSpecVersionOf` in `lib/changes/apply.ts` already resolves the current version with exactly the reasoning step 2 needs. Reuse or extract it — do not write a third implementation of "which spec version is current".
- The failure this unit prevents is **silent**, which is why it is worth its own unit: without it the system still works, it just quietly proposes work that already exists and reports the duplicate as a skip.

## Check When Done

- A project with no applied changes shows no drift notice.
- Applying a change makes the notice appear on the Specs view, naming the count and the current version.
- Generating a spec clears the notice.
- Applying two changes without regenerating reads "2 changes", not "1".
- A change applied *before* the current spec version was generated is not counted.
- A discarded change is never counted; a proposed one is never counted.
- The apply outcome on the Changes view says the spec is now behind.
- A project with no spec at all shows no notice and no error.
- The specs listing response carries the two numbers and still carries no `filePath`.
- No new database column, table, or migration was added.
- No model call is made by any code path this unit touches.
- A signed-out caller and a non-member get no data and no confirmation the project exists.
- `npm run build` passes without type errors.
