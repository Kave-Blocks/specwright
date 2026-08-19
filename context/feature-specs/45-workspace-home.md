`/editor` is the app's landing screen — `app/page.tsx` redirects every authenticated user to it — and it renders one hardcoded sentence, "Create a project or open an existing one", no matter what the user has. A returning user with two projects in the sidebar is told to create one. This unit replaces that single assertion with a workspace home that branches on the user's real state: a recency-ordered grid of their projects, each carrying a status line composed only from persisted columns, plus the paths for starting new work.

The screen currently makes a false claim about the system, which is the one thing an empty state must never do. Everything it needs to be true already exists — `Project.canvasJsonPath`, the spec and build-unit relations, and the three starter designs — and none of it is on this screen.

## Implementation

1. `components/editor/house-badge.ts` — extract the house badge class string.
   - `ui-context.md` states the badge treatment is "not a Build-only one … so the two surfaces cannot drift apart the way they did once". It is nevertheless copied verbatim in three places today: `components/editor/build/build-unit-row.tsx`, `components/editor/changes/changes-view.tsx`, and `components/editor/home/project-home-view.tsx`. This unit adds a fourth surface that wears it, which is the drift the doc names.
   - Export one constant and point all three existing sites at it. **Only the shell is shared — the tone class stays per-site**, exactly as `ui-context.md` describes: Build passes the value's own tone from `types/build-units.ts`, Home passes `text-copy-muted`.
   - The three strings are already byte-identical, so this step must change no rendered output. If a diff appears, the extraction was wrong.

2. `components/editor/home/mode-card.tsx` — make the card visual language importable.
   - `ModeCard` and `PlannedModeCard` are private to `project-home-view.tsx`. Move both **verbatim, doc comments included** — those comments carry the litigated reasoning about why `PlannedModeCard` has no container opacity, and losing them re-opens a decision that has already cost this project a contrast failure.
   - Also export the card container class string as a named constant that `ModeCard` itself consumes. Step 7 renders two more card shapes — a project card with no description, and an action card that is a `<button>` rather than a `<Link>` — and they must wear the identical shell without one component being bent to serve three shapes.
   - `project-home-view.tsx` imports both and renders identically.

3. `app/globals.css` — promote the sidebar width to a layout token.
   - `20rem` is the sidebar's `w-80`, and it is already literal in `components/editor/editor-room-shell.tsx` and `components/editor/canvas/canvas-workspace.tsx`. Step 4 would write it a third time, which `code-standards.md` forbids.
   - Add `--project-sidebar-width: 20rem` to the layout-token block, consume it at `components/editor/project-sidebar.tsx` (`w-(--project-sidebar-width)`, the shorthand already used for `pl-(--canvas-inset-left,0px)`) and at `editor-room-shell.tsx` in place of the literal.
   - **Leave `--canvas-inset-right` alone.** That is the AI chat panel's width — a different component that merely happens to share a value. Collapsing the two because the numbers match is how a token stops meaning anything.

4. `components/editor/editor-shell.tsx` — publish the inset.
   - `EditorRoomShell` publishes `--canvas-inset-left`; `EditorShell` publishes nothing, and `ProjectSidebar` is `fixed w-80 z-30`. Today's single centred block gets away with sitting partly under it. A grid will not.
   - Put the inline custom property on `<main>` (open: `var(--project-sidebar-width)`, closed: `0px`), mirroring `EditorRoomShell`.
   - In the same edit, replace `pt-14` with `pt-[var(--editor-navbar-height)]`. It hardcodes a dimension owned by another component; `EditorRoomShell` already does this correctly.
   - This step is **visually inert on its own** — nothing consumes the property until step 7. That is why it is not a separate unit: applied alone to today's centred block, a 20rem inset makes the screen worse, not better.

5. `lib/projects.ts` and `lib/projects-data.ts` — the data.
   - Add `WorkspaceProject extends Project` carrying `hasCanvas` (from `canvasJsonPath !== null`), `specCount`, `buildUnitCount`, and `shippedBuildUnitCount`.
   - **Do not widen `getEditorHomeProjects` or `Project`.** `getEditorHomeProjects` has two callers — `app/editor/page.tsx` and `app/editor/[roomId]/layout.tsx`, which wraps all six room routes. Widening it taxes every in-project navigation with joins that feed a sidebar rendering only `name` and `slug`. Add a second function, `getWorkspaceHomeProjects`, and leave the first one's return type and `toUiProject` untouched.
   - Because `WorkspaceProject` **extends** `Project`, its arrays are assignable to `EditorShell`'s props. `/editor` therefore makes one fetch and hands the same arrays to both the shell and the new view, and `EditorShell`, `ProjectSidebar`, and `use-project-actions.ts` need no change at all. Say so in a comment — it is the reason the shape was chosen.
   - Query in two rounds, constant regardless of project count. First, the two `findMany` calls on the predicates `getEditorHomeProjects` already uses (owned by `ownerId`, shared by `collaborators.some.email`), each selecting `id`, `name`, `canvasJsonPath`, and `_count` of `specs` and `buildUnits`. Then one `groupBy` on `ProjectBuildUnit` over all resulting ids, filtered to `SHIPPED`, folded into a map; a project absent from the result has zero shipped.
   - The `groupBy` is not a stylistic choice: **the same relation cannot appear twice under one `_count` with different filters**, so total and shipped cannot both come from `_count`. Record that in a comment or someone will "simplify" it back.
   - Return **no `updatedAt`** on the type. Ordering happens server-side and nothing renders a date, which also sidesteps `Date` serialization across the server boundary and locale hydration entirely.
   - Change both `orderBy` clauses in `getEditorHomeProjects` from `createdAt: "desc"` to `updatedAt: "desc"`. Without this the *same sidebar* sorts differently on `/editor` than inside a project, because at `/editor` it is fed from the new function. `updatedAt` is an honest activity signal — canvas autosave, renames, brief saves, and all three sequence counters write the row. **This visibly re-orders a shipped surface**; it is disclosed in the progress file, not slipped in.
   - **Do not surface `Project.description` or `ProjectStatus.ARCHIVED`.** Neither is ever written — the create dialog posts `{id, name}` only, and nothing sets `ARCHIVED`. Rendering either would be inventing state, which is the failure this unit exists to fix.

6. `hooks/use-project-actions.ts` — the create dialog learns where to go next.
   - `submitCreate` hardcodes the post-create push to project home. Give `openCreate` an optional destination and branch on it there.
   - The destination is a **closed union** — project home, discovery, canvas-with-templates — never a raw path string. A client-supplied path flowing into `router.push` is the wrong shape regardless of who calls it today.
   - Carry it on the `{ type: "create" }` variant of the dialog state. Default to project home, so existing behaviour is unchanged.
   - **Then fix both existing call sites.** `components/editor/project-sidebar.tsx` and `components/editor/new-project-button.tsx` pass `onClick={openCreate}` directly, so the click event would arrive as the destination argument. They must become `onClick={() => openCreate()}`. This fails silently, not loudly — it is the one trap in this unit.
   - `CreateProjectDialog` needs no change.

7. `components/editor/home/workspace-home-view.tsx` and `start-work-cards.tsx` — the screen.
   - `workspace-home-view.tsx` is a **Server Component**, as `project-home-view.tsx` is. `EditorShell` is a client component receiving server-rendered `children`, which is what `/editor` already does.
   - Its root is a thin wrapper carrying `pl-(--canvas-inset-left,0px) transition-[padding-left] duration-200 ease-out`, with `mx-auto` centring on an **inner** div. The two-div shape is load-bearing: padding on a centred box insets its content instead of shifting the box. This is recorded in `progress/2026-07-29-sidebar-overlay-layout-fix.md` and demonstrated in `project-home-view.tsx`.
   - Three branches, on `ownedProjects` and `sharedProjects`:
     - **Has owned projects** — "Jump back in", a `sm:grid-cols-2` grid of the most recent projects from the merged list, then a "Start something new" section.
     - **Zero owned, has shared** — the grid is the shared projects, under copy that acknowledges they belong to someone else and names creating your own as the start path. **Never "you have no projects"**, which the sidebar visibly contradicts.
     - **True zero** — no grid; the start cards promoted, plus one sentence defining what a Specwright project is, drawn from `project-overview.md`.
   - The grid is capped and the sidebar holds the remainder. **The copy must not imply the grid is complete**, and this unit adds no "all projects" route.
   - A project card carries: the name, a "Shared" house badge at `text-copy-muted` on collaborator projects only, and one status line. **Owned projects get no counterpart badge** — absence is the signal, the same rule the source-spec badge and the drift notice already follow.
   - `start-work-cards.tsx` is the `"use client"` leaf, consuming `useProjectActionsContext` for `openCreate(destination)`. Three action cards on step 2's shell, rendered as `<button>`: "New project", "Start with a guided interview" (→ `/discovery`), and "Browse starter designs" (→ canvas with the picker open).
   - `app/editor/page.tsx` awaits `getWorkspaceHomeProjects`, passes both arrays to `EditorShell` and to the new view. **Delete `components/editor/new-project-button.tsx`** — after this step nothing imports it; the sidebar's button is inline.

8. `app/editor/[roomId]/canvas/page.tsx` — land on the starter-design picker.
   - "Browse starter designs" creates the project, then routes to the canvas with a search param, and the shipped `StarterTemplatesModal` is already open when the user arrives.
   - There is no active Liveblocks room at `/editor`, and template import runs client-side inside one (`canvas.tsx` → `importTemplate`). This is why the picker is reached *after* creation rather than shown on the home screen: **no new server-side room-seeding path is introduced**, and `architecture-context.md` states templates load into the *active* room.
   - The page reads `searchParams` **on the server** — a `Promise` in this version of Next — and passes a boolean prop into `CanvasWorkspace`, which seeds its templates-open state from it. Server-side read rather than `useSearchParams` matches the repo's page-reads/component-receives pattern and avoids a Suspense boundary.
   - **Do not touch** `canvas.tsx`, `importTemplate`, `StarterTemplatesModal`, or the templates context. The modal opens through the mechanism it already has.
   - No template id crosses a boundary, so there is nothing to validate. The modal's existing "this replaces the current canvas" copy stays true and harmless on a canvas that is empty.
   - This step must land in the same commit as step 7. A search param with no producer, or a card with no handler, are both dead ends.

9. Update `context/ui-context.md` (Workspace Home under Layout Patterns; `EditorShell` now publishes the inset too; `--project-sidebar-width` in the Layout Tokens table; the status-line composition rule and why it omits zeros) and `context/project-overview.md` (Core User Flow step 2 currently reads "User creates or selects a project" with no screen behind it).

## Dependencies

Already installed:

- `@clerk/nextjs`, `prisma` / `@prisma/client`, `lucide-react`

To install:

- nothing

No new env vars. **No migration** — every column and relation this unit reads already exists.

## UI Details

- Cards reuse step 2's extracted shell verbatim: `rounded-2xl border border-surface-border p-5`, icon tile `size-10 shrink-0 rounded-xl bg-subtle text-brand`, `transition-colors hover:bg-elevated`, `focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none`. **No new colour, no second card language** — Project Home and Workspace Home must read as one system.
- The status line is `text-xs font-medium text-copy-muted`, fragments joined with `" · "` (already this repo's inline separator, see `discovery-view.tsx`). It composes from three signals, in order:
  1. `Canvas saved` / `Empty canvas` — always present, wording verbatim from Project Home's Canvas card.
  2. `1 spec` / `{n} specs` — **omitted at zero.**
  3. `{shipped} of {total} shipped` — **omitted when total is zero**; wording verbatim from Project Home's Build card, including its deliberate lack of a singular/plural branch, which that card already argues for.
- So: `Empty canvas`, or `Canvas saved · 2 specs · 3 of 8 shipped`. The line is never empty and needs no zero case.
- **It deliberately omits zero-valued fragments where Project Home states them** ("No specs yet"). This is not drift and must be written into `ui-context.md` as a rule so it is not later read as drift: a mode card is the door to *one* mode, so naming what is behind it is the content; a project card compresses a whole project, so absence is the signal.
- The status line carries **no open-change count**. Project Home has one and it is arguably the most action-worthy signal here, but a four-fragment line gets long. Decided out; it is one `_count` and one fragment if that changes.
- Long project names take `truncate` **with `min-w-0` on the text element itself**, not only on its flex wrapper. `ui-context.md` records this as a real 768px overlap bug, not a theoretical one.
- The wrapper's inset transition must be `duration-200 ease-out`, matching the sidebar, so content and sidebar move together. With the sidebar closed the property resolves to `0px` and the grid takes full width.
- **Mobile matches the existing behaviour** — a flat inset at every viewport. All five room surfaces already do this and it is broken below ~768px; matching it keeps one mechanism, and fixing all six is its own unit. Do not gate the inset at `md:` on this surface alone.
- No illustration, no seeded sample project, no onboarding checklist. The house style has none, a seeded project creates a row someone has to delete, and nothing tracks per-user onboarding state.

## Scope Limits

- do not widen `Project` or `getEditorHomeProjects`' return shape — six room routes pay for it
- do not change `EditorShell`, `ProjectSidebar`, or `use-project-actions.ts` beyond the destination parameter and its two call sites
- do not render `Project.description` or `ProjectStatus.ARCHIVED`; nothing writes either
- do not add a route, an API endpoint, a migration, or a background task
- do not introduce a server-side path that seeds a Liveblocks room with a template
- do not touch `canvas.tsx`, `importTemplate`, `StarterTemplatesModal`, or the starter-templates context
- do not add an "all projects" route or pagination
- do not introduce a second card visual language, a new colour, or a fourth copy of the house badge
- do not use `text-copy-faint` for text anywhere on this surface — it is decoration-only, and the arithmetic is settled in `ui-context.md`
- do not put container opacity on any card; opacity opens a compositing group and the contrast reasoning is in `mode-card.tsx`'s doc comment
- do not fix the mobile inset here

## Notes

- Read `context/project-overview.md`, `context/architecture-context.md`, `context/ui-context.md` (Layout Patterns, Layout Tokens, and the `--text-faint` rule), and `context/code-standards.md` first.
- `context/progress/2026-07-29-sidebar-overlay-layout-fix.md` is this exact overlap bug fixed once already, and records the inset-versus-centring gotcha in step 7.
- `components/editor/home/project-home-view.tsx` is the reference for card structure, status wording, and the reasoning style expected in comments.
- `app/editor/[roomId]/page.tsx` shows how the single-project counts are already fetched; this unit is the multi-project form of the same question.
- Reuse the existing Clerk auth and email-resolution block in `lib/projects-data.ts` rather than restating it, including the branch that skips the shared query when no email resolves — running it with `email: undefined` would match everything.
- Unauthenticated returns empty lists like its sibling, which renders the true-zero branch. Unreachable in practice — `proxy.ts` protects page routes — so mirror the existing behaviour rather than adding a fourth branch for a state the middleware forbids.

## Check When Done

- A signed-in user with at least one project sees their projects on `/editor`, not "Create a project or open an existing one".
- Every status fragment on a project card matches the database: `Canvas saved` appears only when `canvasJsonPath` is non-null, the spec count equals that project's `ProjectSpec` rows, and `{shipped} of {total}` equals its `ProjectBuildUnit` counts.
- A project with zero specs shows no spec fragment; a project with zero build units shows no shipped fragment; a project with neither shows `Empty canvas` alone.
- With the sidebar open, no card is under it; with it closed, the grid takes full width, and the transition matches the sidebar's.
- A user with shared projects but none owned sees the shared branch, and the screen never claims they have no projects.
- A user with no projects at all sees the first-run branch with the start cards and no grid.
- Collaborator projects carry the "Shared" badge; owned projects carry no badge.
- "Start with a guided interview" creates the project and lands on `/discovery`, not project home.
- "Browse starter designs" creates the project and lands on the canvas with the starter-templates picker already open; importing one works exactly as it does from inside the room.
- The existing "New Project" buttons in the sidebar and the create dialog still land on project home.
- The sidebar lists projects in the same order on `/editor` as inside a project.
- Project Home renders identically to before — the badge and card extractions changed no output.
- `npm run lint` passes.
- `npm run verify:db` passes.
- `npm run build` passes without type errors.
