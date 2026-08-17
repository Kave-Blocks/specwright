# Progress Tracker

A dashboard, not a log. `## Current Phase` holds only what is genuinely in flight; everything
else lives in the `## Unit Index` below, one row per unit, linking to its own file under
[`context/progress/`](progress/). Never append a per-unit paragraph to this file — write
`context/progress/NN-name.md` instead and edit that unit's index row in place.

Checks that need a person rather than an agent — a second account, a real payment — wait in
[`context/qa/`](qa/), one file each. A unit's `Verified` level stays honest while they wait.

Work that is decided but not started, and that no numbered unit owns — harness changes, deferred
measurements, gap-closures against units that already shipped — waits in
[`context/plans/`](plans/), one file each. Filing a plan changes no unit's `Verified` level either;
only running the work does.

## Current Phase

Nothing in flight. Pick the lowest-numbered unit in the index below that is not `shipped`.

## Unit Index

Status: `specced` · `in progress` · `shipped` · `deferred` · `blocked`.
Verified: `browser` (driven in a real browser session) · `structural` (types/build/lint, unit
tests, or direct DB/API round-trips outside the UI) · `partial` (some checks browser-verified,
the file says which) · `none`.

| # | Unit | Status | Verified | Summary |
| --- | --- | --- | --- | --- |
| 01 | [design-system](progress/01-design-system.md) | shipped | browser | shadcn/ui (Base UI, Nova preset) + the dark palette installed and wired through `globals.css` |
| 02 | [editor-chrome](progress/02-editor-chrome.md) | shipped | browser | Fixed top navbar and project sidebar, both controlled by a future parent |
| 03 | [auth](progress/03-auth.md) | shipped | browser | Clerk sign-in/sign-up routes, dark two-panel auth layout, `proxy.ts` route protection |
| 04 | [project-dialogs](progress/04-project-dialogs.md) | shipped | structural | Editor Home + Create/Rename/Delete dialogs and `useProjectActions`, still on mock data |
| 05 | [prisma](progress/05-prisma.md) | shipped | structural | `Project`/`Collaborator` schema and Prisma client; migration applied to real Postgres |
| 06 | [project-apis](progress/06-project-apis.md) | shipped | structural | Owner-scoped project CRUD API with shared boundary helpers and 401/403/404 semantics |
| 07 | [wire-editor-home](progress/07-wire-editor-home.md) | shipped | structural | Editor Home reads real projects from a Server Component; mock data path removed |
| 08 | [editor-workspace-shell](progress/08-editor-workspace-shell.md) | shipped | structural | `/editor/[roomId]` shell with server-side access checks; no canvas logic yet |
| 09 | [share-dialog](progress/09-share-dialog.md) | shipped | structural | Collaborator invite/remove API + share dialog; read-only UI branch not browser-driven |
| 10 | [liveblocks-setup](progress/10-liveblocks-setup.md) | shipped | structural | Typed Liveblocks config and access-gated session-token route; no client hooks yet |
| 11 | [base-canvas](progress/11-base-canvas.md) | shipped | structural | Liveblocks-backed React Flow canvas replaces the placeholder; page stays a Server Component |
| 12 | [shape-panel](progress/12-shape-panel.md) | shipped | structural | Bottom shape panel; dragging a shape onto the canvas creates a node |
| 13 | [node-shape](progress/13-node-shape.md) | shipped | structural | Per-shape node rendering + drag preview; follow-up fixed the invisible drag ghost |
| 14 | [node-editing](progress/14-node-editing.md) | shipped | structural | Node resizing and inline label editing through the Liveblocks node-change flow |
| 15 | [node-color-toolbar](progress/15-node-color-toolbar.md) | shipped | structural | Floating per-node toolbar for background + paired text color, no server calls |
| 16 | [edge-behavior](progress/16-edge-behavior.md) | shipped | structural | Custom canvas edge with inline labels, plus four-sided connection handles |
| 17 | [canvas-ergonomics](progress/17-canvas-ergonomics.md) | shipped | structural | Floating zoom/undo/redo control bar and the matching keyboard shortcuts |
| 18 | [starter-templates](progress/18-starter-templates.md) | shipped | structural | Starter template library that replaces the canvas with a prebuilt diagram |
| 19 | [presence-avatars-cursors](progress/19-presence-avatars-cursors.md) | shipped | structural | Avatar group + live cursors on the canvas; Presence field renamed per spec |
| 20 | [ai-sidebar-shell](progress/20-ai-sidebar-shell.md) | shipped | structural | Right-hand AI sidebar becomes a tabbed chat shell, still parent-controlled |
| 21 | [canvas-autosave](progress/21-canvas-autosave.md) | shipped | structural | Canvas JSON persisted to Vercel Blob, blob URL stored on the Prisma project record |
| 22 | [design-agent-api](progress/22-design-agent-api.md) | shipped | structural | Trigger.dev design flow: trigger route, run tracking, run-scoped token route |
| 23 | [design-agent-logic](progress/23-design-agent-logic.md) | shipped | structural | Durable task interprets a prompt with an LLM and writes nodes/edges into the room |
| 24 | [ai-presence-state](progress/24-ai-presence-state.md) | shipped | structural | Shared AI activity indicators via presence and the `ai-status-feed` |
| 25 | [sidebar-chat-feed](progress/25-sidebar-chat-feed.md) | shipped | structural | Real-time room chat on an `ai-chat` feed kept separate from AI progress |
| 26 | [ai-chat-functional](progress/26-ai-chat-functional.md) | shipped | partial | AI sidebar functional end to end; follow-up fixed two bugs found in the first live run |
| 27 | [spec-generation-flow](progress/27-spec-generation-flow.md) | shipped | structural | Spec-generation backend: trigger route, token route, durable task, run ownership |
| 28 | [spec-persistence-download](progress/28-spec-persistence-download.md) | shipped | structural | Specs persisted to Blob + Prisma, retrievable through a membership-gated download route |
| 29 | [spec-ui-integration](progress/29-spec-ui-integration.md) | shipped | structural | Specs tab lists, previews as rendered Markdown, and downloads; Generate Spec now works |
| 30 | [canvas-tool-modes](progress/30-canvas-tool-modes.md) | shipped | browser | Explicit canvas tool mode; first spec verified end to end in a signed-in browser |
| 31 | [select-tool](progress/31-select-tool.md) | shipped | browser | Select/move/resize/delete become select-tool gestures; empty-canvas drag draws a marquee |
| 32 | [hand-tool](progress/32-hand-tool.md) | shipped | browser | Panning becomes its own tool, reachable from anywhere by holding space |
| 33 | [architecture-interview](progress/33-architecture-interview.md) | shipped | partial | Guided Discovery interview composes a structured brief and feeds the existing design path |
| 34 | [project-hub](progress/34-project-hub.md) | shipped | browser | Project Home + independent discovery/canvas/specs routes, gated once in a shared layout |
| 35 | [brief-persistence](progress/35-brief-persistence.md) | shipped | partial | Brief persisted to Postgres; DB round-trip verified, HTTP path not browser-driven |
| 36 | [stack-aware-spec-generation](progress/36-stack-aware-spec-generation.md) | shipped | partial | Specs gain a `## Tech Stack` section fed by the persisted brief; section content not model-verified |
| 37 | [quota-error-surfacing](progress/37-quota-error-surfacing.md) | shipped | partial | A spent OpenAI quota fails fast with an honest message; retry-count not observed |
| 38 | [build-units](progress/38-build-units.md) | shipped | partial | Build units schema, API, UI surface; cascade delete, Planned card, and HTTP concurrency + cross-project scoping all verified. Only the collaborator path (needs a second Clerk account) is unproven. |
| 39 | [spec-versions-and-lineage](progress/39-spec-versions-and-lineage.md) | shipped | browser | Specs numbered per project; build units track source version; backfill verified at depth |
| 40 | [change-proposals](progress/40-change-proposals.md) | shipped | browser | Proposals generate and render end-to-end, applying nothing; no-spec refusal at boundary. |
| 41 | [change-application](progress/41-change-application.md) | shipped | partial | Applying a change creates the new units and marks stale ones superseded **without** rewriting them; 59 library + 36 HTTP checks pass. Browser pass done 2026-08-16: all four badges render at once and the row is not crowded at any width; one real spacing bug found and fixed. Only the collaborator path (needs a second Clerk account) is unproven. |
| 42 | [spec-drift](progress/42-spec-drift.md) | shipped | partial | Drift counted from existing columns — no migration, no model call; 31 library checks pass. Browser-verified 2026-08-16: absent at zero, singular at one, neutral styling, and both surfaces point at the canvas. The plural at two and the listing route's new fields over real HTTP are still unchecked |
| 43 | [canvas-write-back](feature-specs/43-canvas-write-back.md) | specced | none | Pushes an applied change onto the canvas through the existing design path, additively — closes the last structurally broken link in the change loop |

### Other work

Work with no single owning unit — cross-cutting QA passes, branding, layout reversals.

| Date | Slug | Status | Verified | Summary |
| --- | --- | --- | --- | --- |
| 2026-07-09 | [canvas-visual-qa-pass](progress/2026-07-09-canvas-visual-qa-pass.md) | shipped | structural | Flush full-bleed canvas treatment and a dark-mode MiniMap, from an external QA note |
| 2026-07-10 | [editor-qa-bugfix-pass](progress/2026-07-10-editor-qa-bugfix-pass.md) | shipped | structural | 5 reported editor issues reviewed; the 3 that existed fixed, 2 shown not to exist |
| 2026-07-13 | [liveblocks-provisioning-qa](progress/2026-07-13-liveblocks-provisioning-qa.md) | shipped | structural | `ensureRoom`/`ensureFeed` stop swallowing real failures as success |
| 2026-07-13 | [multiplayer-remote-selection](progress/2026-07-13-multiplayer-remote-selection.md) | shipped | structural | Remote selection added and live cursors audited; two-browser path not re-exercised |
| 2026-07-19 | [panels-float-full-bleed](progress/2026-07-19-panels-float-full-bleed.md) | shipped | structural | Side panels layer over a full-bleed canvas; reverses the `08` docked-layout follow-up |
| 2026-07-19 | [rename-to-specwright](progress/2026-07-19-rename-to-specwright.md) | shipped | structural | Ghost AI → Specwright across 16 files; npm name collision with a same-category competitor |
| 2026-07-29 | [sidebar-overlay-layout-fix](progress/2026-07-29-sidebar-overlay-layout-fix.md) | shipped | structural | Floating sidebar no longer covers Home/Discovery/Specs content |
| 2026-07-30 | [agent-harness](progress/2026-07-30-agent-harness.md) | shipped | structural | `tsc`/`lint` hook gates plus global and project agent definitions; no test framework still |
| 2026-07-31 | [text-faint-palette](progress/2026-07-31-text-faint-palette.md) | shipped | partial | `--text-faint` becomes decoration-only; 8 text usages migrated to muted, 5 deferred. |

## Open Questions

- **Build units have no automatic producer for a project's *first* set.** `38` defers deriving units from a generated spec, and `39` does not add it. After `41` ships, the change path produces units automatically while the initial path does not — Specwright will generate five units when asked for offline mode, but the original twenty are typed by hand. The asymmetry is the clearest candidate for the next unit; `38`'s producer contract (match on `key`, no-op on conflict, never write a human-owned column) is already the contract it would be written against.

- **Applying a change never redraws the canvas, and the canvas is what specs are generated from.** `41` updates the build list only. `lib/spec-agent/generate.ts` states that the canvas is the source of truth for what the system contains, so a change that never reaches the canvas never reaches a later spec — a regenerated spec would silently drop everything the changes added. This is why `41` deliberately writes no spec. Pushing an applied change onto the canvas, through the existing design path, needs to be its own unit before a project accumulates several changes.

  **Raised to the top of the queue by `42` (2026-08-16), which made the consequence reachable from the UI.** `42`'s spec had both surfaces tell the user that generating a new spec brings it up to date with the build list. That instruction is false in the system as built, and it is the *only* instruction the drift notice could give that leaves someone worse off than no notice at all: pressing Generate produces a spec that still misses the applied work, **and** resets the drift count to zero, because the count derives from spec versions and any new version clears it. The indicator would then read "resolved" over a spec that resolved nothing.

  `42` shipped with both surfaces pointing at the **canvas** instead, and the reasoning recorded in `architecture-context.md` under `## Spec Drift` and in `ui-context.md` under Specs. That is honest, but it is a workaround: the loop is closed on *reading* the drift and still open on *resolving* it. The next unit is the canvas write-back — after it, and only after it, the notice can safely say "regenerate".

  **Specced 2026-08-17 as unit [`43`](feature-specs/43-canvas-write-back.md).** It pushes an applied change onto the canvas through the existing design path, **additively only** — deletes, moves, and resizes are stripped from the model's plan in code rather than forbidden in the prompt, and `removed` deltas are reported rather than drawn, because no tone in the palette honestly means "retired" and deleting a node is the visual form of the rewrite `41` exists to prevent. Close this question when it ships.

- ~~**OpenAI quota is exhausted (hit 2026-07-29):**~~ — **resolved 2026-08-16.** The account behind `OPENAI_API_KEY` had been returning `429 — "You exceeded your current quota"` (`insufficient_quota`), blocking every AI path. A live `gpt-4o-mini` completion now answers **HTTP 200**, so design generation, spec generation, and change proposals can all run again.

  **What this unblocks, none of it done yet:**
  - Unit `36`'s four content-level checks, still listed under "Not verified" in [`progress/36-stack-aware-spec-generation.md`](progress/36-stack-aware-spec-generation.md) — the `## Tech Stack` section has never been read out of a real generated spec.
  - Unit `37`'s retry-count observation, which needs a *deployed* run rather than a dev one (`retries.enabledInDev: false` makes a dev run single-attempt regardless). The original trace it should be checked against is kept below.
  - Pass 2 of [`plans/browser-verification-40-41.md`](plans/browser-verification-40-41.md) — unit `40`'s proposal-failure UI, which needs a real run to fail rather than a quota outage to fake it.

  The trace below is kept as written: it is what a deployed run should now be checked against, and a topped-up account is exactly when that check becomes possible.

- ~~**A spent OpenAI quota is reported to the user as a transient failure, and it is not one.**~~ — **fixed by unit [`37`](progress/37-quota-error-surfacing.md).** A quota failure is now terminal on the first attempt and carries an honest message; the classification was confirmed against the live exhausted account. Two things remain: the AI SDK's own 3 internal retries stay (deliberate — see `37`'s Scope Limits), and Trigger's actual attempt count was never observed, because `retries.enabledInDev: false` makes a dev run single-attempt regardless. The original trace is kept below, since it is what a deployed run should now be checked against.

  What happened *before* `37`, on both AI paths:

  1. The AI SDK's `generateText` retries the 429 internally **3×** before throwing `RetryError`.
  2. The task's `catch` treats that as an ordinary error. `isTerminalFailure` is false on attempts 1–2 of 3, so **no `error` phase is published** and the error is rethrown — Trigger then retries the whole task (`trigger.config.ts` → `maxAttempts: 3`). Up to **9 doomed model calls** for one click. (`retries.enabledInDev: false`, so this compounds in production only.)
  3. Only on the final attempt does the run publish the generic `phase: "error"` — `"Specwright hit an error and couldn't finish the spec. Please try again."` (`trigger/generate-spec.ts`; `trigger/design-agent.ts` has the same line).
  4. The client settles to its own generic constant — `RUN_FAILED_ERROR` = `"Specwright couldn't finish the spec. Please try again."` (`components/editor/specs/specs-view.tsx`).

  Why that was wrong: **"Please try again" is the one thing that cannot work.** The user waited through three rounds of retry backoff to be told to repeat an action guaranteed to fail until someone topped up billing, with nothing distinguishing it from a genuine blip.

  How `37` resolved it: `lib/ai-errors.ts` classifies `insufficient_quota` (**not** a bare 429 — an ordinary rate limit is also 429 and must stay retriable), both tasks raise it as `AbortTaskRunError` with a distinct message, and the client stops overwriting the run's published text with its own generic constant. No new `AiStatusPhase` member was needed.

- **Ops for AI generation to run live:** sync `OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` into the Trigger.dev environment (dashboard env vars / `syncEnvVars`), then run the Trigger.dev dev worker (`npx trigger dev`) so the `design-agent` task can execute; task env is not auto-loaded from Next's `.env.local`.

- Clerk (`@clerk/nextjs` 7.5.14) logs a deprecation warning at runtime: `createRouteMatcher` is deprecated in favor of resource-based (per-route) auth checks instead of centralized middleware path matching — see https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher. `03-auth.md` explicitly specified the `proxy.ts` + route-matcher pattern used here, so it was kept as specified; revisit if a future unit wants to migrate to per-route `auth.protect()` calls instead. Update (`06-project-apis.md`): `/api/(.*)` is now excluded from the centralized `auth.protect()` and each API handler enforces `auth()` itself (returning `401`) — a first, partial step in the recommended per-route direction, taken because APIs must answer with a status code rather than the redirect `auth.protect()` produces. Page routes still use the centralized middleware protection.

## Architecture Decisions

- shadcn CLI (v4.13.0) defaults to Base UI (`@base-ui/react`) rather than Radix UI as the primitive layer, and to a "Nova" preset (Lucide icons + Geist fonts) — matches this project's existing icon/font choices, so kept the default instead of forcing `--base radix`.
- The dark palette from `ui-context.md` is defined as raw CSS custom properties (`--bg-base`, `--text-primary`, etc.) in `app/globals.css`, then mapped onto shadcn's semantic variables (`--background`, `--card`, `--primary`, ...) so generated `components/ui/*` files stay untouched and still render on-theme.
- `--color-base` was deliberately NOT registered as a `@theme inline` color token: Tailwind's built-in `--text-base` font-size scale key collides with any color named "base", which silently turned every `text-base` (font-size) utility into a text-color rule and made card titles nearly invisible. Fixed by declaring `bg-base` as a standalone `@utility` instead. Keep this in mind before adding more single-word token names — check for collisions with Tailwind's reserved scale keys (`base`, `sm`, `lg`, `xl`, etc.) first.
- `EditorNavbar` and `ProjectSidebar` are controlled components (open/close state lives in a future parent), not self-managing — this keeps them reusable once `08-editor-workspace-shell.md` composes the full editor shell and adds more sidebar/navbar consumers.
- That parent is `components/editor/editor-shell.tsx`, introduced by the editor-home slice of `04-project-dialogs.md`. It is the single `"use client"` boundary for the editor chrome: it holds `isSidebarOpen` and takes `children`, so route pages (`app/editor/page.tsx`, and later `/editor/[roomId]`) stay Server Components and can do server-side data fetching — satisfying invariant 4 (client components only where interactivity requires them). It was deliberately NOT put in an `app/editor/layout.tsx`: `08-editor-workspace-shell.md` gives `/editor/[roomId]` a different navbar (project name, share button, AI sidebar toggle), so a shared layout-level navbar would have to be branched per-route. Sidebar state resets across an `/editor` → `/editor/[roomId]` navigation as a result; if that becomes undesirable, lift it to a layout with a route-aware navbar rather than duplicating the shell.
- `EditorShell` uses `flex flex-1 flex-col` (not `min-h-screen`) because `app/layout.tsx` already sets `html.h-full` + `body.min-h-full flex flex-col`, and `<main>` carries `pt-14` to clear the `fixed` h-14 navbar. No background class is set on the shell — `globals.css`'s base layer already applies `bg-background` (→ `--bg-base`) to `body`.
- `ClerkProvider`'s `appearance.theme` is Clerk's `dark` theme (from `@clerk/ui/themes`), not the `shadcn` theme, even though `components.json` is present — `03-auth.md` explicitly specified "dark theme as base + override variables with app CSS custom properties" rather than the shadcn theme. All Clerk color/typography/radius variables are pointed at this project's existing tokens (`var(--accent-primary)`, `var(--bg-surface)`, `var(--radius-2xl)`, `var(--font-geist-sans)`, ...) so the two approaches converge on the same visual result without pulling in `@clerk/ui/themes/shadcn.css`.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` were added to `.env.local` (they didn't exist before `03-auth.md`) so `proxy.ts` can derive its public-route matcher from env rather than hardcoded path strings, per spec.
- Side panels float **over** a full-bleed canvas rather than docking beside it, so toggling a panel never resizes the canvas — the reasoning, and the `08` follow-up it reverses, are in [`progress/2026-07-19-panels-float-full-bleed.md`](progress/2026-07-19-panels-float-full-bleed.md).

## Session Notes

Short, durable gotchas only. Anything narrative-length belongs in a `context/progress/` file.

- Next.js App Router treats any `app/` folder prefixed with `_` as a private folder excluded from routing entirely — a temporary preview route must NOT be underscore-prefixed or it 404s silently. Use a plain folder name (e.g. `app/preview-x/`) and delete it after verifying in the browser.
- The Playwright MCP browser is a single shared Chrome instance keyed by a fixed user-data-dir; if a prior session left it open (idle on `about:blank`), new `browser_navigate` calls fail with "Browser is already in use" until that stray process is killed.
