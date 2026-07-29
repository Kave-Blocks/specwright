Give every project a landing view — Project Home — with Architecture Interview, Canvas, and Specs as three equally-weighted, independently-addressable modes instead of dropping straight into the canvas. Each mode gets its own route under `/editor/[roomId]`, all reachable at any time from a shared navbar mode-switcher, so opening a project asks "where do you want to work?" instead of assuming Canvas.

## Implementation

1. Hoist auth, access checks, and the Liveblocks room into `app/editor/[roomId]/layout.tsx`.
   - Move the unauthenticated-redirect and `getAccessibleProject`/`AccessDenied` logic out of `app/editor/[roomId]/page.tsx` and into this new layout, so every route under it (`page.tsx`, `canvas/`, `discovery/`, `specs/`) is gated once, not per-route.
   - Wrap `{children}` in `EditorRoom` (unchanged) — the room connection (canvas storage, presence, `ai-chat` and `ai-status-feed`) is a project-wide concern, not a Canvas-only one, since Discovery also publishes to `ai-chat` and Specs also reads it.
   - Wrap `getClerkIdentity`/`getAccessibleProject` in React's `cache()` (already a Next.js-supported pattern) so the layout's access check and a page's own data fetch within the same request share one lookup instead of querying twice.
   - Also fetch `ownedProjects`/`sharedProjects` here (reuse `getEditorHomeProjects`) for the project-switcher sidebar.

2. Narrow `components/editor/workspace-navbar.tsx` into shared, project-wide chrome only.
   - Keep: logo mark, sidebar toggle, project name, Share button.
   - Remove: save status, Templates, and the AI-sidebar toggle (Sparkles) — these are Canvas-specific and move to the Canvas route in step 5.
   - Add a mode-switcher: four items (Home, Architecture Interview, Canvas, Specs) as plain `Link`s to `/editor/[roomId]`, `/editor/[roomId]/discovery`, `/editor/[roomId]/canvas`, `/editor/[roomId]/specs`. Highlight the active one by comparing `usePathname()` — reuse the exact active/rest/hover token pattern already defined for the AI sidebar's tabs (`text-copy-muted`, `data-active:bg-accent-dim data-active:text-brand`) so it reads as the same control family.
   - `ProjectSidebar`, `ProjectDialogs`, and `ShareDialog` move from `EditorWorkspace` up into the layout alongside this navbar — they are project-level, not Canvas-level.

3. Extract the design-submission flow out of `ai-architect-tab.tsx` into `hooks/use-design-submit.ts`.
   - Move the `send`/`activeRun`/`useRealtimeRun`/settle logic (currently inside `AiArchitectChat`) into a standalone hook: `useDesignSubmit(projectId)` returning `{ send(text): Promise<boolean>, busy, error, clearError }`.
   - Behavior must not change: publish the prompt to the room's `ai-chat` feed first, then `POST /api/ai/design`, track the run via `useRealtimeRun`, and post Specwright's closing line (or the failure message) back to the feed exactly as today.
   - Both the Canvas chat panel (step 5) and the new Discovery view (step 6) call this hook instead of each owning a copy — this is what lets Discovery submit into the same shared conversation and design run without duplicating the trigger/token/realtime wiring.

4. Build Project Home: `app/editor/[roomId]/page.tsx` + a client view component.
   - Server component. Reads the project (via the cached helper from step 1) plus two real, already-available signals — do not invent status that isn't backed by data:
     - **Design status**: whether `Project.canvasJsonPath` is set (extend `getAccessibleProject`'s `select` to include it — see step 8). Render as "Canvas saved" vs "Empty canvas", not a node/edge count (that would require fetching and parsing the blob, which this unit does not do).
     - **Spec status**: a real count from `prisma.projectSpec.count({ where: { projectId } })`.
     - **Discovery status**: none — the brief still isn't persisted (deferred in unit 33), so there is no source of truth to show. The Discovery card gets a static description only.
   - Render three mode cards (Architecture Interview, Canvas, Specs), each a `Link` to its route, plus a fourth **non-interactive** card for a future mode — reference the multi-agent "Research Fleet" concept already recorded as the team's deferred long-term direction in `progress-tracker.md`, styled as disabled/planned (reduced opacity, a "Planned" badge, no link, no hover state).
   - No mode is locked or gated behind another — every card is reachable regardless of the other two phases' status, per the project's direction that every interview question (and now every mode) stays optional.

5. Build the Canvas route: `app/editor/[roomId]/canvas/page.tsx` + a narrowed canvas workspace component.
   - Rename/narrow today's `components/editor/editor-workspace.tsx` (`EditorWorkspace`) into a Canvas-only component (e.g. `components/editor/canvas/canvas-workspace.tsx`) that no longer owns `ProjectSidebar`, `ProjectDialogs`, `ShareDialog`, or `ProjectActionsProvider` — those moved to the layout in step 2.
   - It keeps: `AiActivityControlsProvider`, `CanvasGraphProvider`, `CanvasSaveProvider`, `StarterTemplatesProvider`, `CanvasSurface`, `StarterTemplatesModal`, and the AI chat slide-over panel.
   - Move the save-status control, the Templates button, and the AI-chat toggle here (out of the shared navbar per step 2) — they are meaningful only while Canvas is the active route.
   - Simplify the AI chat panel (rename `components/editor/ai-sidebar.tsx` to reflect its narrower job, e.g. `components/editor/ai/ai-chat-panel.tsx`): drop the `Tabs`/`TabsList` wrapper and the `Specs` tab entirely (Specs is now its own route) — render the AI Architect chat directly as the panel's only content.
   - In `ai-architect-tab.tsx` (the chat itself): use `useDesignSubmit` from step 3 instead of its own inline logic; remove the "Guided brief" button and the `ArchitectureInterview` dialog mount (retired in step 6). Optionally add a small text link to `/editor/[roomId]/discovery` in its place ("Prefer a guided flow? Discovery →") — a nice-to-have, not required.

6. Build the Discovery route: `app/editor/[roomId]/discovery/page.tsx` + `components/editor/discovery/discovery-view.tsx`.
   - Retire the `Dialog`-based `components/editor/ai/architecture-interview.tsx` and rebuild its step machine as a full-page view: the same question catalog, chip rendering, and Review step from `lib/architecture-brief.ts` (unchanged), but the shell is a page, not a `Dialog`/`ScrollArea` — reuse the step indicator, segment bar, help text, and Back/Skip/Next(/Generate on Review) footer exactly as designed in unit 33, laid out as page content instead of modal content. Include a link back to Project Home.
   - `initialIdea` starts blank — there is no adjacent freeform textarea to inherit from anymore now that Discovery is its own route (the mini chat panel lives on Canvas). This is an intentional, minor behavior change from unit 33's dialog, where the interview pre-filled from whatever was already typed in the freeform box next to it.
   - `Generate` calls `useDesignSubmit`'s `send(composeBrief(...))`. On success, navigate to `/editor/[roomId]/canvas` so the user lands where the run is writing; on failure, stay on the Review step with the error shown — same contract as unit 33, just a route change instead of a dialog close.

7. Build the Specs route: `app/editor/[roomId]/specs/page.tsx` + `components/editor/specs/specs-view.tsx`.
   - Reuse `useProjectSpecs`, `downloadSpec`, and the existing `GenerateSpecAction` logic from `specs-tab.tsx` unchanged in behavior.
   - Replace the single-column sidebar list + `SpecPreviewDialog` with a two-pane page layout: a list on the left (same `SpecCard` treatment), an inline preview pane on the right showing the selected spec's rendered Markdown (reuse `spec-markdown.tsx`'s rendering, not the dialog chrome) plus a Download action.
   - Generating a spec still reads the live canvas graph via `useCanvasGraph` and the room's `ai-chat` messages via `useAiChat` — both already work outside a Canvas-specific component since the room now connects at the layout level (step 1).

8. `lib/project-access.ts`: add `canvasJsonPath` to `getAccessibleProject`'s `select` — needed for Project Home's Design-status signal in step 4. No other change to this helper.

## Dependencies

Already installed:

- Next.js App Router (nested layouts, route groups), React `cache()`
- shadcn `Tabs`/`ScrollArea`/`Textarea`/`Button` (reused, not new)
- `@trigger.dev/react-hooks`, Liveblocks client (unchanged usage, just called from more places)

To install: none.

No new environment variables.

## UI Details

- Use existing tokens only — no new colors. Mode-switcher pills reuse the AI sidebar's existing tab treatment (`text-copy-muted`, active `bg-accent-dim text-brand`).
- Project Home cards: `rounded-2xl`, `border-surface-border`, hover `bg-elevated` — same card idiom as the rest of the app. The disabled "planned" card must visibly read as non-interactive: reduced opacity, no hover state, a small muted "Planned" badge instead of a chevron/arrow.
- Discovery's full-page shell keeps unit 33's exact chip and step-indicator states (selected `bg-accent-dim text-brand`, rest `bg-subtle text-copy-muted`, hover `bg-elevated`); `Generate` stays `bg-accent-green text-(--bg-base)`.
- Specs' inline preview pane reuses `spec-markdown.tsx` styling verbatim — do not restyle Markdown rendering as part of this unit.
- Respect `--editor-navbar-height` for any layout math introduced by moving controls out of the navbar and into the Canvas route.

## Scope Limits

- do not add a new API route, Prisma model, or Trigger.dev task — this unit only rearranges existing client-side composition and routing.
- do not change `/api/ai/design`, `/api/ai/spec`, either trigger task, or the run-tracking mechanics inside `useDesignSubmit` beyond relocating them.
- do not persist the architecture brief — Discovery still composes and submits it client-side only; persistence is still a later unit (per unit 33).
- do not gate or lock any mode behind another's completion — every mode stays reachable at all times.
- do not build "Research Fleet" (or any other future mode) as working functionality — it is a non-interactive placeholder card only.
- do not attempt to show a live "brief answered" status on the Discovery card — there is no persisted brief to read one from yet.
- do not solve cross-route AI-activity presence: the existing `aiActivity` bridge is populated from inside the canvas render tree and stays there — a collaborator sitting on Home, Discovery, or Specs will not see the "someone is generating" indicator that Canvas shows. This is a known gap this unit intentionally leaves open, not a regression to quietly paper over.
- do not add a compatibility redirect for the old "opening a project drops into canvas" behavior — a bookmarked `/editor/[roomId]` link intentionally now opens Home.
- do not touch `hooks/use-project-actions.ts` — project create already navigates to `/editor/{roomId}`, which now resolves to Home automatically with no code change.

## Notes

- Read `context/project-overview.md`, `context/architecture-context.md`, `context/ui-context.md`, and `context/ai-workflow-rules.md` before implementing.
- This is the first unit that gives the "Discovery → Design → Spec" spine (recorded as the team's chosen direction in `progress-tracker.md`'s unit-33 entry) a navigation model, rather than leaving it as sidebar tabs and a modal.
- Once built, update `context/project-overview.md`'s Core User Flow and `context/ui-context.md`'s Layout Patterns to describe Project Home and the four-route structure — do this after implementation, reflecting actual state, not before.
- Reuse `lib/architecture-brief.ts` (question catalog + `composeBrief`) unchanged — this unit only moves its presentation layer, not its logic.

## Check When Done

- Opening any project (`/editor/[roomId]`) shows Project Home, not the canvas.
- Home's Design status reflects whether the project has a saved canvas (`canvasJsonPath`), and its Spec status shows a real generated-spec count.
- Architecture Interview, Canvas, and Specs each have their own route, and each is reachable directly from the mode-switcher and from Home's cards at any time, regardless of the other modes' state.
- Discovery's step flow (freeform, single-select, multi-select, skip, back, review) behaves exactly as it did as a dialog in unit 33; a successful Generate navigates to Canvas and the design appears there through the existing realtime flow; a failure keeps the user on Review with the error shown.
- Canvas's AI chat panel still generates from a freeform prompt exactly as before, now without the "Guided brief" entry point, and using the shared `useDesignSubmit` hook.
- Specs' list, preview, download, and generate behavior is unchanged, now rendered as a full page instead of a sidebar tab.
- Share, the project-switcher sidebar, and project rename/delete continue to work identically from every route.
- No new API route, Prisma model, or Trigger.dev task exists as a result of this unit.
- `npm run build` passes without type errors.
