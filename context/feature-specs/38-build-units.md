A project keeps an ordered list of **build units** — the pieces of work a team intends to implement — each with a status and a verification level they can update as the work happens. Specwright stops at "here is your spec" today; this gives a project a place to track what has actually been built against the architecture it designed.

## Implementation

1. `prisma/models/project-build-unit.prisma` — the new model and its enums.
   - `ProjectBuildUnit`: `id` (cuid), `projectId`, `sequence` (Int), `key` (String), `title` (String), `summary` (String, optional), `status`, `verified`, `source`, `createdAt`, `updatedAt`.
   - Three enums, SCREAMING_SNAKE like the existing `ProjectStatus`: `BuildUnitStatus` (`SPECCED`, `IN_PROGRESS`, `SHIPPED`, `DEFERRED`, `BLOCKED`, default `SPECCED`), `BuildUnitVerified` (`NONE`, `STRUCTURAL`, `PARTIAL`, `BROWSER`, default `NONE`), `BuildUnitSource` (`MANUAL`, `SPEC`, default `MANUAL`).
   - The two vocabularies mirror the `Status` and `Verified` columns of `context/progress-tracker.md`'s `## Unit Index`. Do not invent new values or rename existing ones.
   - `@@unique([projectId, key])` — the natural key a future automatic producer matches against. `@@unique([projectId, sequence])` — also serves as the ordering index, so no separate `@@index` is needed; say so in a doc comment, as `prisma/models/task-run.prisma` does for `runId`.
   - Relation to `Project` with `onDelete: Cascade`, matching `ProjectSpec` and `ProjectCollaborator`.
   - Doc-comment the model in the house style (see `prisma/models/project-spec.prisma`) recording two things a later change must not undo: **`status`, `verified`, and `sequence` are human-owned — no automatic producer may write them**, and **gaps in `sequence` are correct**, because a number is never reused after a delete.

2. `prisma/models/project.prisma` — the counter and the back-relation.
   - Add `nextBuildUnitSequence Int @default(1)` and the `buildUnits ProjectBuildUnit[]` back-relation.
   - The counter exists because deriving the next number from `max(sequence) + 1` reuses a number after the highest unit is deleted, and because two members creating a unit at the same moment would collide on it.
   - Generate and apply the migration. If the shadow-database step fails against the hosted Postgres, fall back to the author-then-deploy flow recorded in `context/progress/05-prisma.md`.

3. `types/build-units.ts` — the wire contract, client-safe.
   - String-union types for status, verified, and source, using the **lowercase tracker vocabulary** on the wire (`"in progress"` with the space, `"browser"`, …) so the API and the Unit Index read identically.
   - `BuildUnitSummary` — `id`, `sequence`, `title`, `summary`, `status`, `verified`, `source`, `createdAt`, `updatedAt`. **`key` is not included**: it is a server-side matching detail, not something the client renders. Follow the "return only what the client renders" discipline `types/specs.ts` documents.
   - `BuildUnitListResponse`, and ordered display metadata for both vocabularies (value → label → token class) so the UI has one source for order, wording, and color.
   - This module must import nothing from `lib/` or from the generated Prisma client, for the reason `types/specs.ts` states at the top of the file.

4. `lib/build-units.ts` — server-side behavior, the only module that maps enums.
   - Derive a unit's `key` from its title: lowercased, non-alphanumerics collapsed to single hyphens, trimmed. When the result is empty (a title that is entirely punctuation or non-Latin), fall back to `unit-{sequence}`, which is unique by construction.
   - Normalize a title and summary on the way in: trim, reject an empty title, and **truncate over-length text rather than rejecting it** — the policy `MAX_BRIEF_LENGTH` in `app/api/projects/[projectId]/brief/route.ts` documents for human-typed text with no `maxlength` at its source.
   - Parse wire values back to enum members, returning `null` on anything unrecognized so the route can answer 400 rather than trusting the input.
   - Create a unit by incrementing `Project.nextBuildUnitSequence` and inserting the row **in one transaction**, so a concurrent create cannot take the same number.
   - List a project's units ordered by `sequence` ascending.
   - Define the per-project unit cap here (200 — a runaway guard, in the spirit of the canvas payload's node and edge caps, not a product limit).

5. `app/api/projects/[projectId]/build-units/route.ts` — the collection.
   - `GET` lists the project's units in build order. `POST` creates one from a title and optional summary, answering 201 with the created unit.
   - Both use `withProjectMember` from `lib/api-auth.ts`. Build units are project *content*, like the canvas and the architecture brief — not project *lifecycle*, which is what `withProjectOwner` guards. The reasoning is already written out in the brief route's doc comment; follow it.
   - Query by the `project.id` the guard resolved, never the raw path param, as `app/api/projects/[projectId]/specs/route.ts` does.
   - A duplicate title collides on the derived key: catch Prisma's `P2002` and answer 409 with a message a person can act on, reusing the detection shape already in `app/api/projects/[projectId]/collaborators/route.ts`.
   - Answer 409 when the project is already at the unit cap.

6. `app/api/projects/[projectId]/build-units/[unitId]/route.ts` — one unit.
   - `PATCH` accepts any of `title`, `summary`, `status`, `verified`, and answers 400 when the body carries none of them. Changing the title **re-derives the key**, so renaming a unit to match what a future spec will call it creates the match rather than guaranteeing a duplicate. A rename into a taken key is a 409, same as a create.
   - `DELETE` removes the unit. The counter does not roll back.
   - Both use `withProjectMember`, and both scope the write to `{ id: unitId, projectId }` and answer 404 when nothing matched — the row-scoping pattern in `app/api/projects/[projectId]/collaborators/[collaboratorId]/route.ts`, which is what stops a unit id from another project being reachable through a project the caller does belong to.

7. `hooks/use-project-build-units.ts` — the client data hook.
   - Model it directly on `hooks/use-project-specs.ts`: plain `fetch` with an `AbortController`, a reload key, a request counter that ignores a superseded response, and no shared or global state.
   - Beyond that hook's `units` / `isLoading` / `error` / `refresh`, expose `create`, `update`, and `remove`. Each applies the row the server returned to local state rather than refetching the whole list, so changing a status does not blank the list and flash.

8. `components/editor/build/build-view.tsx` — the Build surface (`"use client"`).
   - Takes `projectId`. A centered column: an always-visible add form at the top (title, optional summary), then the units in build order.
   - Each row shows its number padded to two digits, the title, the summary, and its current status and verification as badges. Selecting a row expands it to reveal the status and verification chip rows plus rename and delete. Only one row is expanded at a time.
   - Loading, error, and empty states follow `components/editor/specs/specs-view.tsx`.
   - Split a row component out if the file grows past comfortable reading.

9. `app/editor/[roomId]/build/page.tsx` — the route.
   - A Server Component that awaits `params` and renders the view with `projectId`, exactly the shape of `app/editor/[roomId]/specs/page.tsx`. The access gate and the room connection already live in the shared layout; this page adds neither.

10. `components/editor/workspace-navbar.tsx` — reach it from the mode-switcher.
    - Add `Build` as the fifth and last entry in `modes`, after Specs. Keep the label to the single word; the switcher has no wrap or scroll handling and "Architecture Interview" is already the long one.

11. `app/editor/[roomId]/page.tsx` and `components/editor/home/project-home-view.tsx` — the Home card.
    - Count the project's units, total and shipped, alongside the existing spec count, and pass both down.
    - Add a real Build `ModeCard` as the **fourth** card and move the existing `PlannedModeCard` to fifth. **Do not reuse the placeholder slot** — it names Research Fleet, a deferred product direction recorded in both that component and `context/ui-context.md`, and overwriting it to save a grid cell deletes a decision rather than an empty space.
    - Status line: "No units yet" when empty, otherwise "{shipped} of {total} shipped", with the same singular/plural care the Specs card takes.

12. Update `context/architecture-context.md` (build units under the storage model — Postgres only, no Blob half and no realtime channel — and the two routes under the membership-gated group), `context/ui-context.md` (the Build route in Layout Patterns, and the Home card count going from four to five), and `context/project-overview.md` (Build in the core user flow and a Features entry).

## Dependencies

Already installed:

- `prisma` / `@prisma/client` 7.8 — multi-file schema, models under `prisma/models/`
- `next` 16.2.10, `@clerk/nextjs`, `tsx` (dev)

To install:

- nothing

No new environment variables. Nothing in this unit reads `OPENAI_API_KEY` or reaches Vercel Blob.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- **Status and verification chips** use the established three states: selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated` — the same treatment as the canvas tool panel and Discovery's option chips (`context/ui-context.md`).
- **Collapsed-row badges** reuse the muted badge treatment already used for the "Planned" card and the share dialog's owner row.
- Radius scale: `rounded-2xl` for unit cards, `rounded-xl` for inline controls and chips.
- The view root must carry `pl-(--canvas-inset-left,0px)` with `transition-[padding-left] duration-200 ease-out`, like Project Home, Discovery, and Specs. Its controls sit in document flow, so without it the floating project sidebar renders on top of them — the bug fixed on 2026-07-29.
- Component states to cover: add form (default, empty-disabled submit, pending), row (rest, hover, expanded), and list (loading, error, empty). The error state is `role="alert"` in `text-error`.

## Scope Limits

- do not make any AI or model call, anywhere in this unit
- do not change the spec-generation prompt or anything under `trigger/`
- do not derive units automatically from a generated spec — that is a later unit
- do not add per-check completion state or a status transition history
- do not add a Liveblocks feed, presence field, or any other realtime channel for build units
- do not put a unit's status or sequence under the control of anything but a person
- do not add a `components/ui/*` file or a new UI primitive for the status control
- do not reuse the Research Fleet placeholder card's slot
- do not change `ProjectStatus`, which is a shelf state and not a lifecycle
- do not renumber or reuse a unit's `sequence`

## Notes

- Read `context/architecture-context.md` and `context/code-standards.md` before implementing; `context/ui-context.md` for the chip, badge, and layout tokens.
- Read `context/progress-tracker.md`'s `## Unit Index` for the exact status and verification vocabularies — they are the source, not a starting point.
- Guard precedent: `lib/api-auth.ts` holds both `withProjectOwner` (lifecycle) and `withProjectMember` (content) side by side; the brief and canvas routes are the content precedent to follow.
- Server Components by default; `"use client"` only on the view that needs interactivity.
- The `key` uniqueness, the no-op-on-conflict rule, and the human-owned columns are the contract a later automatic producer will be written against. Getting them right here is the point of the unit.

## Check When Done

- A signed-in project member can open `/editor/[roomId]/build` from the mode-switcher and from Project Home's Build card.
- Adding a unit from the Build page inserts it at the end of the list and it survives a page reload.
- Changing a unit's status and its verification level persists, and the two are independent — a unit can read `shipped` with `none`.
- Renaming a unit persists, and renaming it to another unit's title is refused with a message rather than silently duplicating or overwriting.
- Deleting the highest-numbered unit and then adding a new one gives the new unit a **higher** number, not the deleted one.
- Two units created in parallel against the same project receive different numbers.
- A title made only of punctuation or non-Latin characters still creates a unit rather than failing.
- A title or summary far over the bound is stored truncated rather than rejected.
- A collaborator who is not the owner can add a unit and change its status; a signed-out caller and a non-member both get no data and no confirmation the project exists.
- A unit id belonging to a different project cannot be updated or deleted through a project the caller does belong to.
- Deleting a project removes its units.
- Project Home's Build card reads "No units yet" on an empty project and "{shipped} of {total} shipped" once units exist.
- Opening a project that existed before this unit shows an empty Build page rather than an error.
- `npm run build` passes without type errors.
