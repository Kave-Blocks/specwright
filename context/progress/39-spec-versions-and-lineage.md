# 39 — Spec Versions and Lineage

A project numbers its specs sequentially per version, and a build unit records which spec produced it. This is the lineage layer the change flow (units 40, 41) is written against. No model call, so library and database layers are fully verifiable independent of spec generation.

## What Shipped

### Schema and Migration

`prisma/models/project.prisma` (edit): Added `nextSpecVersion Int @default(1)`, doc-commented as the same pattern as `nextBuildUnitSequence` — a stored counter, not `max(version) + 1`, so two collaborators pressing Generate Spec at once cannot collide.

`prisma/models/project-spec.prisma` (edit): Added `version Int` and `@@unique([projectId, version])`. Doc comment records that a version is assigned once and never reused or renumbered, that the counter (not the unique) is the mechanism and the unique is the last line of defence, and that there is deliberately no `supersedesId` — a spec supersedes its predecessor by definition; the relationship is already true and needs no column.

`prisma/models/project-build-unit.prisma` (edit): Added `specId String?` with a `spec ProjectSpec?` relation at **`onDelete: SetNull`**, never Cascade. A build unit is human-owned tracked work; removing a spec must never delete the unit. `source` stays because it is what survives the null-out — a unit orphaned by a removed spec still knows it was `SPEC`, not `MANUAL`.

Migration `20260731120000_add_spec_versions` (new): Hand-authored three-step add — `version` nullable → backfill → `SET NOT NULL`. Backfill numbers each project's specs by `createdAt` ascending (ties broken by `id`) via `ROW_NUMBER() OVER (PARTITION BY "projectId" ...)`, then sets each project's `nextSpecVersion` to its spec count + 1. Applied with `prisma migrate deploy` against the hosted Prisma Postgres (the author-then-deploy flow recorded in `context/progress/05-prisma.md`), then `prisma generate`; `prisma migrate diff --from-config-datasource --to-schema prisma --script` reports an empty migration, i.e. no drift.

### Server Library

`lib/spec-agent/storage.ts` (edit): `saveProjectSpec` now increments `Project.nextSpecVersion` and inserts the `ProjectSpec` row in one `prisma.$transaction`; the returned value minus one is the spec's version. The `UPDATE … RETURNING` row lock is the concurrency contract, the same shape as `createBuildUnit`'s sequence (unit 38 precedent). The Blob upload stays outside the transaction, so a failed upload burns no version. `SavedProjectSpec` gained `version`. `specDownloadFilename` now takes a **version** and returns `spec-v3.md`.

### HTTP Routes

`app/api/projects/[projectId]/specs/route.ts` (edit): Selects and returns `version`; filename derived from it. Ordering stays newest-first by `createdAt` (documented: versions ascend with creation, so ordering by version is the same list by a less obvious route).

`app/api/projects/[projectId]/specs/[specId]/download/route.ts` (edit): The existing ownership lookup now also selects `version` and passes it to `specDownloadFilename`; no second read.

### Wire Types

`types/specs.ts` (edit): `ProjectSpecSummary` gained `version: number`; `filePath` still unselected.

`types/build-units.ts` (edit): `BuildUnitSummary` gained `specVersion: number | null` (the version, not the id — same "return only what the client renders" discipline as `key` and `filePath`).

### Build Units — Lineage Integration

`lib/build-units.ts` (edit): `UNIT_SELECT` reads the lineage through the relation (`spec: { select: { version: true } }`), never `specId`; `toSummary` maps it to `specVersion: row.spec?.version ?? null`.

### UI — Specs List

`components/editor/specs/specs-view.tsx` (edit): The list card and the preview pane header both read "Version N" instead of the id-derived filename; created-at stays the secondary line. Aria labels became "Preview version N" / "Download version N". The spec id survives only in the download URL and as a React key.

### UI — Build Units Row

`components/editor/build/build-unit-row.tsx` (edit): New `SourceSpecBadge` renders a quiet "from v2" badge on a unit with a source spec, reusing the existing `BADGE` treatment at `text-copy-muted` (the house badge established by unit 38's contrast fix), with `aria-label="From spec version N"`. A manual unit renders nothing — absence is the signal.

**Design-note deviation worth recording:** the unit spec's UI Details called the marker `bg-subtle text-copy-muted`; it shipped on the house badge's `bg-base border border-surface-border` instead (unit 38's final treatment), because `text-copy-muted` only reaches 4.27:1 on `bg-subtle` — the exact contrast finding unit 38 already settled. The treatment used is the one that shipped in unit 38, not a new chip style.

### Documentation Updated

`context/architecture-context.md` (edit): Added spec versioning explanation + the no-supersession rule + `SetNull` lineage under Storage Model; added `version` in the listing contract and the filename derivation under Spec Retrieval; added the `specVersion`-not-`specId` note under Build Units.

`context/ui-context.md` (edit): Specs list now labelled by version; added the "from v2" badge and the absence-is-the-signal rule on the Build row.

### Verification Script

`scripts/verify-spec-versions.ts` (new), wired as `npm run verify:spec-versions`. Library/database layer, no model call, so verifiable independent of spec generation. It creates and deletes its own `verify-spec-versions-`-prefixed throwaway projects; the backfill phase is read-only. The backfill-deep phase (added 2026-07-31) seeds synthetic history at depth and exercises the migration's SQL verbatim from the migration file itself.

## Verification Actually Run (quote these honestly)

- **Types, build, and lint.** `npm run build` — passed, no type errors. `npm run lint` — clean. A `tsc --noEmit` hook also gated every edit.

- **Library and database layer: `npm run verify:spec-versions -- all`** — **35/35 checks passed**, against the real Postgres and the real Blob store:
  - **sequential**: fresh project starts at `nextSpecVersion` 1; specs take versions 1, 2, 3; each yields `spec-v{n}.md`; counter ends one ahead.
  - **concurrent**: 5 parallel `saveProjectSpec` calls, none failed, versions distinct and 1..5 with no gaps, counter advanced by exactly 5.
  - **lineage**: derived unit reports `specVersion: 2`, manual unit `null`; deleting the spec row leaves the unit present with `specId` nulled and `status`, `verified`, `sequence` unchanged and `source` still `SPEC`; the orphaned unit then reports `specVersion: null`; no response field leaks `specId` or `filePath`.
  - **cascade**: deleting a project removes its specs.
  - **backfill**: every pre-existing spec row has a version, versions are 1..n in `createdAt` order per project with no gaps, each counter is spec count + 1, and every spec-less project still sits at 1.
  - **backfill-deep** (2026-07-31): a new phase in `scripts/verify-spec-versions.ts` (`npm run verify:spec-versions -- backfill-deep`) exercises the migration's backfill at depth and proves it correct. The phase reads the two backfill `UPDATE` statements verbatim from `prisma/migrations/20260731120000_add_spec_versions/migration.sql` rather than copying the SQL into the script — so the test exercises the migration itself and cannot drift from it; it asserts exactly 2 statements are found, so a changed migration fails loudly. It seeds four throwaway projects at depths 1, 5, 12 and 0 specs, with `createdAt` deliberately inverted relative to insertion order (last-inserted row is oldest) to catch a backfill leaning on insertion order instead of `createdAt`. The deepest project contains two specs with an exact `createdAt` tie, testing the id-based tiebreaker the migration uses. Every seeded row starts at version 1000+ (deliberately wrong) so "the migration set it" is distinguishable from "it was already right". The statements run inside a transaction that is always rolled back, then re-reads afterwards prove the rollback actually took. All 8 checks pass: exactly 2 statements found; every seeded spec renumbered to 1..n by (createdAt, id); the exact-tie pair takes two distinct consecutive versions; each seeded project's counter becomes its spec count + 1; no `(projectId, version)` duplicate anywhere after the backfill; the transaction rolled back; pre-existing spec rows unchanged afterwards; seeded rows back at their placeholder versions. The phase was negative-controlled: with the independently-computed expectation deliberately swapped to insertion order, the "renumbered to 1..n by (createdAt, id)" check fails as it should — so the phase can actually fail, and its pass is meaningful. That control was reverted.

- **Browser QA** (`browser-qa` subagent, real Chromium, signed-in Clerk session, dev server on :3001, against a seeded throwaway project since torn down) — **all 9 checks passed**:
  - list reads "Version 3 / 2 / 1" newest-first with timestamps as the secondary line
  - no uuid or `spec-<uuid>.md` string anywhere in visible text
  - selecting v2 retitles the preview header to "Version 2"
  - Download saved `spec-v3.md`
  - the specs listing JSON carries `version` and no `filePath`
  - the build-units JSON carries `specVersion` 2 / null and no `specId` or `filePath`
  - the derived row shows SPECCED / NONE / FROM V2 while the hand-typed row shows only SPECCED / NONE
  - zero console errors and no failed requests on either page

## Not Verified (be explicit about the layer)

- **The migration's step ordering** — the nullable add → backfill → `SET NOT NULL` sequence was proven by the single real deploy on 2026-07-31. The backfill-deep phase's SQL re-runs were exercised against a post-migration schema, not replayed as part of an actual `migrate deploy` against a genuine pre-migration database.
- **The HTTP layer for concurrency** — parallelism was proven by calling `saveProjectSpec` directly, not through concurrent requests to a route. (The spec generation path is a Trigger.dev task, not a request handler, so this is closer to the real path than it would be for build units — but it is still not the route.)
- **The collaborator path** — unchanged from unit 38's open gap; no second Clerk account.
- **A real end-to-end spec generation** — unverified for this unit only because it was never exercised during the unit's work, not due to any environment problem. `saveProjectSpec` was tested with fixed Markdown. The `OPENAI_API_KEY` in `.env.local` is valid (re-probed via `dotenv` + `GET https://api.openai.com/v1/models` → 200); an earlier false negative was caused by a hand-rolled env parser that included the surrounding quote characters from `OPENAI_API_KEY="sk-proj…"` as part of the key value, which the app's actual `dotenv` loader strips correctly. **Lesson:** a verification method's negative result is evidence only about that method, not the system. Hand-rolled env parsing is not a substitute for the loader the app actually uses.

## Design Note

The spec UI Details named the source-spec badge as `bg-subtle text-copy-muted`, but shipped with unit 38's final house badge (`bg-base border border-surface-border`). This is not a bug fix — it is a precedent alignment. Unit 38 already settled the `text-copy-muted` tone at 5.16:1 on `bg-base` as the house badge treatment (after addressing its earlier 4.27:1 contrast shortfall on `bg-subtle`). Using that treatment here rather than inventing a new one keeps the visual system coherent and means the "from v2" badge reads as one consistent treatment alongside any other badges the row may carry.
