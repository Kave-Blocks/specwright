Every generated spec gets a per-project version number, and a build unit records which spec produced it — so a project reads "Version 3" instead of an opaque file id, and a unit can say where it came from.

This is the lineage layer the change flow (`40`, `41`) is written against. It makes no model call, so it is the only unit in that arc that can be verified while the OpenAI quota is exhausted.

## Implementation

Unit `38` must be shipped first — this unit adds a column to `ProjectBuildUnit`, which `38` creates.

1. `prisma/models/project.prisma` — the version counter.
   - Add `nextSpecVersion Int @default(1)`.
   - The counter exists for the same reason `nextBuildUnitSequence` does (`38`): two collaborators pressing Generate Spec at the same moment would both read the same `max(version)` and collide. Doc-comment it pointing at that precedent so a reader sees one pattern, not two.

2. `prisma/models/project-spec.prisma` — the version.
   - Add `version Int` and `@@unique([projectId, version])`.
   - Doc-comment in the house style that a version is assigned once and never reused, and that the unique constraint is the last line of defence behind the counter rather than the mechanism itself.
   - Do **not** add a `supersedesId`. While every spec is a full regeneration from the canvas, version N supersedes N−1 by definition and the column would store nothing. Record facts that are already true; a supersession *relationship* does not exist until a change can produce a spec, and at that point its target may not even be a spec.

3. `prisma/models/project-build-unit.prisma` — the lineage link.
   - Add `specId String?` with a relation to `ProjectSpec`, **`onDelete: SetNull`**. A build unit is human-owned tracked work: removing a spec must never delete it. Cascade here would let an artifact clean-up destroy a person's record of what they built.
   - `source` stays even though it is now nearly derivable from `specId`. It is what survives the null-out — a unit orphaned by a removed spec still knows it was not hand-typed.

4. The migration.
   - Three steps in one migration: add `version` as nullable, backfill, then alter to `NOT NULL`.
   - Backfill: within each project, number the existing specs by `createdAt` ascending, starting at 1. Set each project's `nextSpecVersion` to its spec count + 1. Deterministic — no guessing and no reliance on insertion order.
   - If the shadow-database step fails against the hosted Postgres, fall back to the author-then-deploy flow recorded in `context/progress/05-prisma.md`.

5. `lib/spec-agent/storage.ts` — assign the version when the spec is stored.
   - `saveProjectSpec` increments `Project.nextSpecVersion` and inserts the `ProjectSpec` row **in one transaction**, so a concurrent generation cannot take the same number.
   - The Blob upload still happens first and stays outside the transaction, for the reason the function's existing doc comment gives: the row must only be written once the artifact it points at exists. A failed upload therefore burns no version.
   - Return `version` alongside `id` and `filePath`.

6. `types/specs.ts` — the wire contract.
   - Add `version` to the spec summary the listing returns. `filePath` stays unselected, as it is today — a blob URL is never returned to a client.

7. `app/api/projects/[projectId]/specs/route.ts` — return the version.
   - Select and return `version` in the listing. Ordering stays newest-first; do not reorder by version, which would be the same order by a less obvious route.

8. `components/editor/specs/specs-view.tsx` — read a version instead of an id.
   - The list labels each entry by its version ("Version 3"), not by a filename derived from the spec id.
   - Keep the created-at line as the secondary detail. The id stops being user-visible entirely.

9. `lib/spec-agent/storage.ts` — the download filename.
   - `specDownloadFilename` takes the version and returns `spec-v3.md`. The version is server-assigned and numeric, so it is as safe in a `Content-Disposition` header as the id was.
   - Its one caller is the download route; update it to pass the version it already loads when it proves the spec belongs to the project.

10. `types/build-units.ts` and `components/editor/build/build-view.tsx` — show where a unit came from.
    - Add the source spec's `version` (not `specId`) to `BuildUnitSummary`. The id is a server-side detail, following the same "return only what the client renders" rule the file already documents for a unit's `key`.
    - A unit derived from a spec shows a quiet "from v2" marker on its row. A manually-created unit shows nothing — absence is the signal, not an "added by hand" badge.

11. Update `context/architecture-context.md` (spec versioning under the storage model, and the version replacing the derived filename in Spec Retrieval) and `context/ui-context.md` (the Specs list labelling by version).

## Dependencies

Already installed:

- `prisma` / `@prisma/client` 7.8 — multi-file schema, models under `prisma/models/`
- `@vercel/blob`, `next` 16.2.10

To install:

- nothing

No new environment variables. Nothing in this unit reads `OPENAI_API_KEY`.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- The version label reuses the Specs list's existing primary-text treatment; it replaces the filename string rather than being added beside it.
- The "from v2" marker on a build unit row uses the muted badge treatment `38` established for collapsed-row badges (`bg-subtle text-copy-muted`), not a new chip style.
- Component states to cover: the Specs list (loading, error, empty, populated) and a build unit row with and without a source spec.

## Scope Limits

- do not make any AI or model call, anywhere in this unit
- do not change the spec-generation prompt or anything under `trigger/`
- do not add a `supersedesId` or any spec-to-spec relationship
- do not derive build units automatically from a spec — that is still a later unit
- do not add a spec delete route or any way to remove a spec
- do not renumber or reuse a spec's version
- do not return `filePath` or `specId` to a client
- do not change `ProjectBuildUnit`'s `status`, `verified`, or `sequence`, or how any of them is written

## Notes

- Read `context/architecture-context.md` and `context/code-standards.md` before implementing; `context/ui-context.md` for the badge and list tokens.
- `38`'s `nextBuildUnitSequence` is the precedent for the counter and its transaction — reuse the shape rather than inventing a second one.
- The rule this unit is built on, and which `40` and `41` are written against: **add a column that records a fact already true, not one that anticipates a relationship.** `version` and `specId` describe things that are true the moment they are written; a supersession link does not.

## Check When Done

- A project's Specs list labels each entry by version, newest first, with no spec id or uuid-derived filename visible anywhere in the UI.
- Generating a spec on a project that already has two specs produces Version 3.
- Downloading that spec saves it as `spec-v3.md`.
- Two spec generations started in parallel against the same project receive different versions, and neither fails.
- A project that had specs before this unit shows them numbered from 1 in creation order, with no gaps.
- A project that had no specs before this unit generates its first as Version 1.
- A build unit created from the Build page shows no source marker; a unit with a `specId` set directly in the database shows "from v{n}" matching that spec's version.
- Deleting a spec row directly in the database leaves any unit that pointed at it intact, with its source marker gone and its status and verification unchanged.
- Deleting a project removes its specs.
- No response from any specs route contains `filePath` or `specId`.
- `npm run build` passes without type errors.
