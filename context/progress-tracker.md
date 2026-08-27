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
| 22 | [design-agent-api](progress/22-design-agent-api.md) | shipped | structural | Trigger.dev design flow: trigger route, run tracking, run-scoped token route. **Room scoping fixed 2026-08-17** ([note](progress/2026-08-17-design-route-room-scoping.md)): the route no longer accepts `roomId` from the body — it access-checked `projectId` and acted on `roomId`, so a cross-project canvas write and delete was reachable by any authenticated user. 16 HTTP checks pass, and the verifier was shown to fail against the pre-fix route |
| 23 | [design-agent-logic](progress/23-design-agent-logic.md) | shipped | structural | Durable task interprets a prompt with an LLM and writes nodes/edges into the room. Unchanged by the 2026-08-17 room-scoping fix ([note](progress/2026-08-17-design-route-room-scoping.md)) and deliberately so: the payload is still `{ prompt, roomId }`, what changed is who is trusted to supply the room. Note this task is **not** destructive-filtered the way `canvas-sync` is — it may `deleteNode`, which cascades attached edges |
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
| 43 | [canvas-write-back](progress/43-canvas-write-back.md) | shipped | partial | An applied change is pushed onto the canvas through the existing design path, additively; destructive operations are stripped in code and removals are reported, never drawn. **`updateNode` is scoped to nodes the change's delta names** (2026-08-27) — an update aimed elsewhere is refused, reported, and counted apart from the destructive drops, and the outcome now names each updated node's previous label. 278 library + DB checks pass. **Browser-verified 2026-08-27**: the end-to-end check this unit exists for (push, regenerate, and the spec names the change's component), all five push-control states including failed-and-retriable, both drift-notice wordings, live realtime arrival, AI presence appearing and clearing, and no node or edge lost across a push. Still unexercised: the HTTP layer (two 409s, 404 masking, signed-out and non-member), the collaborator path, `trigger deploy`, and the outcome well's two new blocks |
| 44 | [spec-derived-build-units](progress/44-spec-derived-build-units.md) | shipped | structural | A project's current spec derives its first build units, closing the asymmetry `41` created. `38`'s producer contract implemented a second time and the first time against model output: only adds, never writes a human-owned column, and a key collision makes a second derivation a no-op — so no migration and no "already derived" column. 43 library + DB checks pass. UI shipped 2026-08-19 as [`46`](progress/46-derive-units-ui.md), so the route now has a caller and was exercised over real HTTP from a browser. The task has still never run in a worker |
| 45 | [workspace-home](progress/45-workspace-home.md) | shipped | partial | Replaces `/editor`'s single hardcoded sentence with a workspace home that branches on the user's real state. Browser-verified 2026-08-19: the grid, the "Shared" badge, the sidebar clearance, all three start paths, 768px truncation, and Project Home rendering unchanged. Every status fragment matched the database across all 10 real projects, and the three class extractions were proved to change no rendered output. **Not seen: the two empty branches** — they need account states this account cannot have, filed in [`qa/`](qa/workspace-home-empty-branches.md). Discloses a visible re-order of the shipped sidebar (`createdAt` → `updatedAt`) |
| 46 | [derive-units-ui](progress/46-derive-units-ui.md) | shipped | partial | The control that calls `44`'s route — deriving a project's first build units from its spec, on the Build tab. One control above every list branch, primary while the list is empty and `secondary` once it has units; the no-spec case is disabled **with the reason on it** and never flashes that wording before the spec list answers. Browser-verified 2026-08-19: all four spec/list combinations, both HTTP requests (`/api/ai/units` + its token route, `200` each), the in-flight state, and the loading→answer sequence sampled at 100ms on projects with and without a spec. **No outcome state has ever rendered** — every one needs a `trigger dev` worker, which is the standing ops blocker. Deviates from the spec on placement (one instance, not two) and folds two run-metadata readers into `lib/trigger-run.ts` |

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
| 2026-08-18 | [regression-harness](progress/2026-08-18-regression-harness.md) | shipped | structural | Eight `verify:*` scripts gain `verify:db` (5 suites, no server), `verify:http` (3 suites, dev server + Clerk session), and `verify:all`. `verify:db` passes end to end and is now item 4 of the unit-close checklist; the permission allowlist went from one entry to eleven. Deliberately **not** a `Stop` hook — see the file |
| 2026-08-17 | [design-route-room-scoping](progress/2026-08-17-design-route-room-scoping.md) | shipped | structural | `POST /api/ai/design` stops accepting `roomId` from the body — it access-checked one id and acted on another, putting a cross-project canvas **write and delete** in reach of any authenticated user. Spans units 22/23. 16 HTTP checks pass and the verifier was proved to fail against the pre-fix route; nothing about the room the task then mutates, or the browser, is covered |

## Open Questions

- **Specwright elicits every input a stack decision needs and consumes none of them as one — it has no opinion about anything.** Filed 2026-08-19. This is the largest open gap in the product, and it is *encoded* rather than merely unbuilt, which is why it needs a decision here before a unit is specced against it.

  Three places actively refuse to recommend, and each is correct in isolation:

  1. **The interview has no model at all.** [`lib/architecture-brief.ts`](../lib/architecture-brief.ts)'s `composeBrief` is pure and deterministic by design — eighteen answers in, Markdown out. It elicits and never responds. A skipped question prints `not specified` and is disclosed under `## Assumptions`, which nothing downstream reads.
  2. **The spec agent is instructed not to decide.** [`lib/spec-agent/generate.ts`](../lib/spec-agent/generate.ts): *"An unanswered field is not licence to pick a default or invent a stack"*, and *"Where a detail is not specified, say so in Open Questions rather than inventing a decision."* So `36`'s `## Tech Stack` section is a **transcription** of what the user already supplied, not a recommendation. That is the right instruction for a spec and it should not be relaxed.
  3. **Security is one clause of one prose section.** `## Technical Considerations` carries "scaling, failure modes, security, and storage decisions the diagram implies" — unstructured, uncounted, and impossible to track or act on.

  **The finding that makes this tractable:** the interview already collects a complete, bounded, typed feature vector — `actors`, `scaleTier`, `growth`, `dataShapes`, `consistency`, `latency`, `integrations`, `availability`, `compliance`, `priority`, `budget`. Those are precisely the inputs a datastore, platform, and security recommendation derives from. `composeBrief` flattens all of them into prose for a model that is then forbidden to decide with them. **The signal is collected and thrown away**, and closing this needs no new elicitation to start — only a consumer.

  **What closes it** is a fifth artifact type — a *decision record* — not a prompt change. The shape is decided and recorded in [`architecture-context.md`](architecture-context.md)'s `## Architecture Decisions`, which is explicitly marked as unbuilt: a fixed catalog of decision slots so an *absent* decision is reportable, a `basis` citing the brief answers each recommendation derives from (unresolvable basis is dropped and counted, per `40`), `not specified` producing a **question** rather than a default, and a human-owned `status` — `38`'s producer contract a fourth time. A rejected or superseded decision is kept, for the reason `40` keeps a discarded proposal and `41` keeps a superseded unit: **the reason a team ruled something out outlives the choice they made.**

  **Not yet decided, and needed before a spec is written:** the unit split. At minimum this is a producer unit (route + task + artifact) and a UI unit, which `ai-workflow-rules.md` requires be separate — the same split `27`/`28`/`29` used for specs and `44`/`46` used for units. Whether the decision catalog ships with all ten slots or a smaller set first is also open, as is whether the adaptive-interview branching (a pure predicate on `BriefQuestion`, no model — see the architecture section) is part of the first unit or its own.

  **The deployment and live-user half is deliberately second**, and its shape is recorded under `## Runtime Tracking` in the same file. Guidance during a deployment is only meaningful against a system that holds opinions, so it is gated on the above; and it introduces the first **inbound** path in the product — a webhook has no authenticated user, so invariant 3 is not satisfied by reusing `withProjectMember`. That is a new auth boundary, and it should not be opened while the recommendation half does not exist.

  **One caution on sequencing.** Three shipped things have never run in a worker — `43`'s end-to-end live proof, `44`'s task, and every one of `46`'s outcome states — all behind the standing ops blocker below. This adds a fifth agent surface on top of an unverified base. The `trigger dev` blocker is worth clearing first; it is cheaper than any unit here and it is what makes the next one verifiable at all.

- ~~**Build units have no automatic producer for a project's *first* set.**~~ — **closed 2026-08-18 by unit [`44`](progress/44-spec-derived-build-units.md).** A project's current spec now derives the units it implies, through `38`'s producer contract implemented a second time — match on `key`, add what does not exist, never write a human-owned column. It needed no migration: `specId` and `BuildUnitSource.SPEC` had been in place since `39` and `38` respectively, waiting for exactly this producer. The reasoning is recorded in `architecture-context.md` under `## Deriving Build Units From A Spec`.

  **The route had no caller, and now it does.** `44` deliberately stopped at the route — `ai-workflow-rules.md` forbids combining UI and background-task changes in one step, and the spec path was split the same way across `27`/`28`/`29` — so nothing in the product called `POST /api/ai/units`. **Shipped 2026-08-19 as unit [`46`](progress/46-derive-units-ui.md)**: the control on the Build tab, primary while the build list is empty and quiet beside the add form once it has units, reporting created, skipped, and dropped separately. Both the trigger route and its token route were exercised over real HTTP from a signed-in browser.

  **What is still open is not this asymmetry but the worker.** `46` could start a derivation and could never watch one finish, because no `trigger dev` worker is running — so no outcome state has ever rendered, the list has never been seen updating on completion, and the run-published failure message has never been shown. Those are `46`'s "Not verified" list, and they join `43`'s live-proof check behind the standing ops blocker below.

- ~~**Applying a change never redraws the canvas, and the canvas is what specs are generated from.**~~ — **closed.** Structurally 2026-08-17 by unit [`43`](progress/43-canvas-write-back.md); **in fact 2026-08-27**, by the live proof. An applied change is pushed onto the canvas through the existing design path, additively: destructive operations are stripped from the model's plan **in code** rather than forbidden in the prompt, and `removed` deltas are reported rather than drawn. `42`'s drift notice gained the second state it was always meant to have — while any applied change is unpushed it names the step that comes first, and only once all of them are on the canvas does it say that regenerating brings the spec up to date. The reasoning is recorded in `architecture-context.md` under `## Canvas Write-Back` and in `ui-context.md` under Specs and Changes.

  **The check the unit exists for has now been run, and it passed.** On 2026-08-27, in a signed-in browser against worker `20260821.1`, a change was applied, pushed to the canvas, and a new spec generated from that canvas. Version 2 contains, verbatim: *"The Realtime Canvas interacts with a Sync Queue for managing real-time updates."* — `Sync Queue` being the change's `added` delta entry. The loop is no longer closed only in structure. What the pass did **not** close, because no browser pass can, is the route's HTTP layer, the collaborator path, and `trigger deploy`; `43` is `partial`, not `browser`, for that reason. The pass also found that `updateNode` was free to relabel a node the change never named; that was **closed the same day** — an update now survives only against a node the delta names, and one aimed elsewhere is refused and reported. See `43`'s second follow-up of 2026-08-27.

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

- ~~**Ops for AI generation to run live:** sync `OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` into the Trigger.dev environment (dashboard env vars / `syncEnvVars`), then run the Trigger.dev dev worker (`npx trigger dev`) so the `design-agent` task can execute; task env is not auto-loaded from Next's `.env.local`.~~ — **half of this was never true. Corrected 2026-08-21.**

  The env-var half is wrong, and it is what made this read as a blocker. `trigger.dev@4.5.3`'s CLI resolves **five** files — `.env`, `.env.development`, `.env.local`, `.env.development.local`, `dev.vars` (`trigger.dev/dist/esm/utilities/dotEnv.js`) — and hands the result to the task worker. `.env.local` has always been among them, so `OPENAI_API_KEY` and `LIVEBLOCKS_SECRET_KEY` already reach every task. Nothing needs pasting into the dashboard, and `syncEnvVars` is irrelevant here: it syncs vars for **`trigger deploy`**, where tasks run in Trigger's cloud and take runtime env from the dashboard. That belongs to [`plans/trigger-deploy-audit.md`](plans/trigger-deploy-audit.md).

  Two things worth keeping, since both are counter-intuitive:
  - **The CLI's precedence is the inverse of Next.js's.** `dotenv` runs with `override: false`, so the *first* file to define a key wins and `.env` beats `.env.local`. Next.js is the other way round ([its docs](../node_modules/next/dist/docs/01-app/02-guides/environment-variables.md), "Environment Variable Load Order"). The same key in both files means the app and the worker can silently use **different** values — keep secrets in `.env.local` only.
  - **In dev, local dotenv files override the Trigger.dev dashboard** (`dev/devSupervisor.js` spreads them last), which is the opposite of what the dashboard being "the environment" suggests.

  **What actually remained was the worker itself, and it is now running.** `npm run trigger:dev` on 2026-08-21 brought up local worker `20260821.1`, and all **five** tasks registered — `canvas-sync`, `derive-units`, `design-agent`, `generate-spec`, `propose-change`. `canvas-sync` and `derive-units` had never been picked up by a worker before. The CLI's own startup line reads `injected env (13) from .env.local`, which is the finding above stated by the tool itself.

  **No unit's `Verified` level changes because of this**, per [`plans/README.md`](plans/README.md)'s rule — starting a worker is not running the check. What it does is make the checks *possible* — and on 2026-08-27 the first of them ran: the canvas write-back live proof passed against this worker, closing unit [`43`](progress/43-canvas-write-back.md)'s end-to-end check. That plan is deleted; what it could not reach is now [`plans/verify-canvas-http.md`](plans/verify-canvas-http.md).

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
