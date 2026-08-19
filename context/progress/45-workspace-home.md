# 45 — Workspace Home

`/editor` is the app's landing screen — `app/page.tsx` redirects every authenticated user to it —
and it rendered one hardcoded sentence, "Create a project or open an existing one", no matter what
the user had. A returning user with two projects in the sidebar was told to create one. That is the
one thing an empty state must never do: make a false claim about the system, on a screen where the
sidebar sits beside it visibly contradicting the claim.

This unit replaces that sentence with a screen that branches on the user's real state, and every
signal on it is composed from a column that already existed.

## What shipped

**The screen** — `components/editor/home/workspace-home-view.tsx`, a Server Component (as
`project-home-view.tsx` is; `EditorShell` is the client boundary and takes server-rendered
`children`). Three branches:

- **Has owned projects** — "Jump back in", a `sm:grid-cols-2` grid capped at 6, then a
  "Start something new" section.
- **Zero owned, has shared** — the grid is the shared projects, under copy that says they belong
  to someone else and names creating your own as the start path. Never "you have no projects".
- **True zero** — no grid, the start cards promoted, and one sentence defining what a Specwright
  project is, drawn from `project-overview.md`.

A project card carries the name, a "Shared" house badge at `text-copy-muted` on collaborator
projects only, and one status line. Owned projects get no counterpart badge — absence is the
signal, the same rule the source-spec badge and the drift notice already follow.

The status line composes `Canvas saved`/`Empty canvas` (always), then `{n} spec(s)` **omitted at
zero**, then `{shipped} of {total} shipped` **omitted when total is zero**, joined with `" · "`.
So `Empty canvas`, or `Canvas saved · 2 specs · 3 of 8 shipped`. It deliberately omits zeros where
Project Home states them ("No specs yet"); that is written into `ui-context.md` as a rule so it is
not later read as drift — a mode card is the door to *one* mode, so naming what is behind it is the
content; a project card compresses a whole project, so absence is the signal.

**The start cards** — `components/editor/home/start-work-cards.tsx`, the `"use client"` leaf, the
only interactive piece on the screen. Three `<button>` cards on the shared card shell: "New
project", "Start with a guided interview" (→ `/discovery`), "Browse starter designs" (→ canvas with
the picker open). All three create the project first.

**The data** — `getWorkspaceHomeProjects` in `lib/projects-data.ts`, returning
`WorkspaceProject[]` (`lib/projects.ts`). `WorkspaceProject` **extends** `Project`, so its arrays
are assignable to `EditorShell`'s props: `/editor` makes one fetch and hands the same arrays to
both the shell and the view, and `EditorShell`, `ProjectSidebar`, and `use-project-actions.ts`
needed no change for it at all.

`getEditorHomeProjects` was deliberately **not** widened. Its callers are `app/editor/page.tsx`
(now replaced by the new function) and `app/editor/[roomId]/layout.tsx`, which wraps all six room
routes — widening it would tax every in-project navigation with joins feeding a sidebar that
renders only `name` and `slug`.

Two rounds of queries, constant regardless of project count: the two `findMany` calls on the
predicates the sibling already uses, each selecting `id`, `name`, `canvasJsonPath` and `_count` of
`specs` and `buildUnits`; then one `groupBy` on `ProjectBuildUnit` over all resulting ids, filtered
to `SHIPPED`. The `groupBy` is not stylistic — **the same relation cannot appear twice under one
`_count` with different filters**, so total and shipped cannot both come from `_count`. That is
recorded in a comment in the file.

The type carries **no `updatedAt`**: ordering happens server-side and nothing renders a date, which
sidesteps `Date` serialization across the server boundary and locale hydration entirely.

**Three extractions**, because this unit would otherwise have added a fourth copy of a string the
docs already call a house style:

- `components/editor/house-badge.ts` — `HOUSE_BADGE`, the badge shell. It was byte-identical in
  `build-unit-row.tsx`, `changes-view.tsx`, and `project-home-view.tsx`; all three now import it.
  Only the shell is shared, the tone class stays per-site.
- `components/editor/home/mode-card.tsx` — `ModeCard` and `PlannedModeCard` moved out of
  `project-home-view.tsx` with their doc comments intact (they carry the litigated reasoning about
  why `PlannedModeCard` has no container opacity), plus `CARD_SHELL` and `CARD_ICON_TILE` as named
  constants. The three card shapes across the two screens — mode `<Link>`, project `<Link>`,
  start-work `<button>` — wear the identical shell rather than one component being bent to serve
  three.
- `--project-sidebar-width: 20rem` in `app/globals.css`, consumed by `ProjectSidebar` itself
  (`w-(--project-sidebar-width)`) and by both shells where `20rem` was literal.
  `--canvas-inset-right` was left alone: that is the AI chat panel's width, a different component
  that merely happens to be the same number.

**The inset** — `EditorShell` now publishes `--canvas-inset-left` on its `<main>`, mirroring
`EditorRoomShell`, and its `pt-14` became `pt-[var(--editor-navbar-height)]`. `ProjectSidebar` is
`fixed w-80 z-30`; a single centred block got away with sitting partly under it, a grid does not.

**The destination** — `openCreate` takes an optional destination, a **closed union**
(`"project-home" | "discovery" | "canvas-templates"`), carried on the `{ type: "create" }` dialog
variant and branched on in `submitCreate`. Never a raw path string: a client-supplied path flowing
into `router.push` is the wrong shape regardless of who calls it today. Default is project home, so
existing behaviour is unchanged.

**The picker** — `app/editor/[roomId]/canvas/page.tsx` reads `?templates=1` **on the server** (a
`Promise` in this version of Next) and passes a boolean into `CanvasWorkspace`, which seeds its
templates-open state from it. `canvas.tsx`, `importTemplate`, `StarterTemplatesModal`, and the
templates context were not touched — the modal opens through the mechanism it already has. The
param name lives in `lib/canvas-route.ts`, shared by its one producer and its one consumer so the
two cannot drift into a param with no reader. No server-side room-seeding path was introduced;
there is no active Liveblocks room at `/editor`, which is exactly why the picker is reached *after*
creation.

`components/editor/new-project-button.tsx` was deleted — nothing imports it; the sidebar's button
is inline.

## Deviations from the spec

- **The `openCreate` trap failed loudly, not silently.** The spec warned that
  `onClick={openCreate}` would pass the click event as the destination argument and fail silently.
  In this repo it does not: shadcn's `Button` types `onClick`, so `tsc` rejected both call sites by
  name the moment the parameter was added. Both were fixed as instructed anyway
  (`onClick={() => openCreate()}`), with a comment at the sidebar's, and one of the two files was
  then deleted.
- **`CARD_ICON_TILE` was extracted alongside `CARD_SHELL`.** The spec names only the container
  class. The icon tile was already duplicated between the two cards in `project-home-view.tsx` with
  only its tone differing, and the start-work cards would have been a third copy — so it takes the
  same shell-plus-per-site-tone split the badge does.
- **`getProjectViewer` was factored out of `getEditorHomeProjects`.** The spec says to reuse the
  existing Clerk auth and email-resolution block rather than restating it, including the branch
  that skips the shared query when no email resolves (running it with `email: undefined` would
  match everything). Reuse required naming it; both functions now call it.
- **The grid orders owned-then-shared, not strictly by recency.** Each list arrives ordered by
  `updatedAt desc`, but they cannot be interleaved by it — the type deliberately carries no
  `updatedAt`, so there is no key to merge-sort on. Owned-first is the honest priority for a screen
  about resuming your own work. Recorded in a comment at the merge.

## Disclosed behaviour change

**The project sidebar visibly re-orders.** Both `orderBy` clauses in `getEditorHomeProjects` moved
from `createdAt: "desc"` to `updatedAt: "desc"`. Without it the *same sidebar* would sort
differently on `/editor` than inside a project, because at `/editor` it is now fed from the new
function. `updatedAt` is also the honest activity signal — canvas autosave, renames, brief saves,
and all three sequence counters write the row. This changes a shipped surface for every user, and
it is here rather than slipped in.

There is no index on `Project.updatedAt` (the model indexes `ownerId` and `createdAt`). At this
project's scale that is not worth a migration, and the unit's scope forbids one; it is the obvious
first thing to add if the sidebar query ever shows up in a slow log.

## Verified

- `npm run lint` — passes, no output.
- `npm run build` — passes, no type errors; all 12 page routes and 23 API routes still compile.
  `--project-sidebar-width` reaches the compiled CSS as both a declaration (`20rem`) and a use
  (`w-(--project-sidebar-width)` → `width: var(--project-sidebar-width)`).
- `npm run verify:db` — all six suites pass, exit 0. The unit did not break units 39–44.
- **The three extractions change no rendered output**, checked rather than asserted: a throwaway
  script ran the repo's own `clsx` + `tailwind-merge` over the before/after class strings for the
  Planned badge, the mode-card shell, both icon tiles, and the planned container, and compared them
  as sets. All five identical. This matters because `tailwind-merge` could have dropped
  `text-[0.625rem]` when a `text-*` colour was merged in beside it; it does not.

- **Every status fragment matches the database**, checked against the real Postgres rather than
  read off a screen. A throwaway probe ran the exact two-round query the new function uses
  (`_count` of `specs`/`buildUnits`, then the `SHIPPED` `groupBy`) over every project in the
  database, composed the status line from what it returned, and compared each number against an
  independent per-project `count()`. All 10 projects matched, and the zero-omission rule is visible
  in the output:

  ```
  ✓ Testing-AI-Design
      line:  Canvas saved · 2 of 4 shipped
      truth: canvasJsonPath=true specs=0 units=4 shipped=2
  ✓ Another AI testing
      line:  Canvas saved · 1 spec
      truth: canvasJsonPath=true specs=1 units=0 shipped=0
  ✓ Hello
      line:  Canvas saved
      truth: canvasJsonPath=true specs=0 units=0 shipped=0
  ✓ system-design
      line:  Empty canvas
      truth: canvasJsonPath=false specs=0 units=0 shipped=0

  All 10 projects: the two-round query matches per-project counts.
  ```

  Zero specs drops the spec fragment, zero units drops the shipped fragment, neither leaves
  `Empty canvas` alone, and one spec inflects singular. The probe was deleted rather than kept —
  it asserts against whatever happens to be in the database, so it would be a non-deterministic
  suite, and the numbers it checked are quoted above instead.

### Browser pass — 2026-08-19

Driven in a real signed-in Chrome session against `npm run dev`, on an account with two owned
projects and one shared with it.

- **The false claim is gone.** `/editor` renders "Jump back in" with a project grid, not "Create a
  project or open an existing one". The grid held MetaBoss, JobFndr, and Hello — exactly the union
  of the sidebar's two tabs, in owned-then-shared order.
- **The "Shared" badge is on the collaborator project and nowhere else.** Hello carried it;
  MetaBoss and JobFndr carried nothing.
- **Status lines were correct for every card on screen** — `Empty canvas`, `Empty canvas`,
  `Canvas saved` — and match what the database probe above independently reported for those rows.
- **No card is under the sidebar.** With it open at 1200px the sidebar measured `x:12–332` and the
  first card began at `x:400` — 68px of clear gap. Closing it slides rather than jumps: the sidebar
  stays mounted and translates off-screen, and the content re-centres over the same 200ms.
- **"Start with a guided interview" lands on `/discovery`** — `/editor/qa-interview-probe-rnsld0/discovery`,
  not project home.
- **"Browse starter designs" lands on the canvas with the picker open** —
  `/editor/qa-templates-probe-dcvqzv/canvas?templates=1`, the "Start from a template" dialog showing
  its three templates, and importing Microservices populated the canvas exactly as it does from
  inside the room (Client → API Gateway → Auth/Users/Orders services and their databases).
- **The sidebar's "New Project" still lands on project home** — `/editor/qa-sidebar-probe-3vqog1`,
  "Where do you want to work?". This is the path the destination parameter was most likely to have
  broken.
- **Project Home renders identically to before.** Six cards, same two-column grid, same status
  lines, and the "Planned" badge on Research Fleet unchanged — checked on both a brand-new project
  and an existing one. The badge and card extractions changed no output, as the class-set check
  above predicted.
- **The sidebar lists projects in the same order on `/editor` as inside a project** — five
  projects, identical sequence in both contexts.
- **Long names truncate cleanly at 768px.** A project named "QA Extremely Long Project Name For
  Truncation Overflow Testing Purposes Only" ellipsised inside its card with no overflow past the
  card boundary and no overlap with the status line beneath it.
- **Zero console errors and zero failed requests** across the whole session. The only recurring
  message was Clerk's pre-existing development-keys warning. No hydration warnings.

Two observations from that pass, both examined and both intended:

- **"The grid takes full width" with the sidebar closed is true of the inset, not of the viewport.**
  The content stays `max-w-3xl` and re-centres; it does not reflow to 1200px. That is the shape the
  spec itself mandates one paragraph earlier — `mx-auto` centring on an inner div, mirroring
  `project-home-view.tsx` — and widening it on this screen alone would break the "Project Home and
  Workspace Home read as one system" rule the same spec sets. What the inset controls is whether
  content sits under the sidebar, and it does not.
- **The templates picker appears once the canvas finishes loading (~2s), not the instant the route
  mounts.** The modal renders inside `CanvasFlow`, inside the Liveblocks room, so it cannot exist
  before the room connects. That is "the mechanism it already has", which the spec explicitly
  forbade changing; the alternative would be a server-side room-seeding path, also forbidden.

## Not verified
- **The shared-only branch and the true-zero branch have never been seen.** Both need an account
  state the test account cannot have — one owning nothing but added to someone else's project, and
  one owning nothing at all. Filed as `context/qa/workspace-home-empty-branches.md` rather than
  written off here. The code paths are exercised by nothing but type-checking.
- **A status line with all three fragments has never rendered in a browser.** No project on the test
  account has both specs and build units, so only `Empty canvas` and `Canvas saved` were seen on
  screen. The three-fragment form (`Canvas saved · 2 specs · 3 of 8 shipped`) is proved only by the
  database probe above, which composed it from real rows outside the UI.
- **Keyboard and focus order across Workspace Home was not checked** — tab order through the grid
  and the three start-work buttons, and focus-visible rings on the card shells.
- **The re-ordered sidebar was not checked against a project whose `updatedAt` moved without its
  `createdAt`** — e.g. saving a canvas on the oldest project and watching it rise to the top. The
  ordering change is proved by the query and by the probe's output being ordered by activity, not by
  watching a row move.
