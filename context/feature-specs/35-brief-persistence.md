Persist the Architecture Interview's composed brief on the project, so Discovery leaves a durable record instead of a value that only ever lived in a client submit call — and give Project Home's Discovery card a real status instead of the static-only description unit 34 left it with.

## Implementation

1. `prisma/models/project.prisma` — add `architectureBrief String?` to `Project`.
   - Nullable, no default: a project that has never run Discovery has `null`, not an empty string.
   - One column, not a new model: this is a **single current value per project**, the same shape as `canvasJsonPath` — the latest brief, not a history. It is overwritten on every successful Generate, unlike `ProjectSpec`, which is deliberately a list of point-in-time outputs users browse and download.
   - Add a Prisma migration for it (`prisma migrate dev`), named in the existing `add_X` convention (`add_task_run`, `add_project_spec`) — e.g. `add_project_architecture_brief`.

2. `lib/project-access.ts` — add `architectureBrief` to `AccessibleProject` and to `getAccessibleProject`'s `select`, exactly how `canvasJsonPath` was added in unit 34.
   - No new query: `getAccessibleProject` is already wrapped in `cache()`, so every caller that already fetches the accessible project (the room layout, Project Home) gets this field for free.

3. New route `app/api/projects/[projectId]/brief/route.ts` — `PUT` only, no `GET`.
   - Guard with `withProjectMember` (`lib/api-auth.ts`), not `withProjectOwner`: the brief is composed collaboratively the same as the canvas, and `PUT /api/projects/[projectId]/canvas` is the direct model to follow for both the guard and the "stable overwrite" shape.
   - Read the body with `readJsonBody`, trim the submitted text, and reject an empty string with a 400 — an empty brief is not a valid save.
   - Truncate (never reject) an over-length submission to a generous bound (e.g. 20,000 characters) before writing it. This follows the project's existing policy for human-typed, un-`maxlength`-ed text: `MAX_FREE_TEXT_LENGTH` in `lib/architecture-brief.ts`, `AI_CHAT_MAX_LENGTH` in `hooks/use-ai-chat.ts`, and the `MAX_LABEL_LENGTH` fix recorded in the progress tracker's "Spec payload QA follow-up" all truncate rather than 400 a legitimate submission that merely ran long.
   - Write directly to `Project.architectureBrief` — no Vercel Blob. The brief is bounded (a composed interview brief measured at roughly 1.2–4.5k characters in unit 33's own testing) and stored the same way `Project.description` already is: as a plain column, not a generated artifact requiring the Blob/Prisma split `canvasJsonPath` and `ProjectSpec.filePath` use for genuinely large content.
   - No `GET` route: a client already gets the current value through `getAccessibleProject` (step 2); a future server-side consumer (spec generation) reads `Project.architectureBrief` directly via Prisma, in-process, with no need for an HTTP round trip to its own backend.

4. `components/editor/discovery/discovery-view.tsx` — on a successful Generate, also `PUT` the exact submitted text (the same string handed to `send()`, whichever is live — an untouched composed brief or a hand-edited Review) to the new route.
   - Fire this alongside triggering the design run, not gating it: a failure to persist must not block, delay, or error out the existing Generate → design-run → navigate-to-Canvas flow. Log the failure (`console.error`) and continue — this mirrors the best-effort stance the codebase already takes for non-critical side writes (see `ensureFeed`/`ensureRoom`'s best-effort logging in `lib/liveblocks.ts`), applied here because the record is a durability improvement, not part of the critical path the user is already watching (the status strip, the run itself).
   - This call belongs in `DiscoveryView`, not in `useDesignSubmit`: only a Discovery-composed brief should ever be persisted here, never a one-line freeform prompt typed into Canvas's chat, and `useDesignSubmit` is shared by both callers.

5. `app/editor/[roomId]/page.tsx` + `components/editor/home/project-home-view.tsx` — give the Architecture Interview card a real status line, the same treatment Canvas ("Empty canvas" / "Canvas saved") and Specs ("No specs yet" / "N specs generated") already have.
   - Derive `hasBrief` from `Boolean(project.architectureBrief)` in the page (no new query — same `getAccessibleProject` call already used for `hasCanvas`) and pass it down.
   - Render `"Brief composed"` when true; no status line when false, matching the other two cards' pattern of omitting the line entirely for a card's untouched/default state — do not invent a "not started" string that the other two cards don't have an equivalent of.

## Scope Limits

- do not feed the persisted brief into spec generation's prompt in this unit — that is the natural next unit once this durable record exists, not this one.
- do not rehydrate the Discovery interview's per-question answers from a persisted brief on reopen. Only the final composed (and possibly hand-edited) Markdown is stored; `composeBrief` in `lib/architecture-brief.ts` is one-directional (answers → text), and there is no reverse mapping to reconstruct `BriefAnswers` from it.
- do not persist a history of briefs, and do not add a new Prisma model for this — one nullable column on `Project`, overwritten each time, per Implementation step 1.
- do not store the brief in Vercel Blob.
- do not add a `GET` route for the brief, and do not add any UI to view or edit a previously-saved brief outside of running Discovery again — Project Home only ever shows whether one exists, never its content.
- do not let a brief-persistence failure block, delay, or surface an inline error on the Generate flow.
- do not touch `useDesignSubmit`, `/api/ai/design`, or the design-run tracking mechanics — this unit only adds one new write, called from `DiscoveryView` alongside the existing, unchanged submit.

## Notes

- Read `context/architecture-context.md` (Storage Model, Invariants) and `context/ai-workflow-rules.md` before implementing.
- `PUT /api/projects/[projectId]/canvas` (`app/api/projects/[projectId]/canvas/route.ts`) is the direct model for the new route: same guard (`withProjectMember`), same "stable path, overwrite" shape, same "metadata belongs in Postgres" reasoning — just without the Blob half, since this artifact doesn't need it.
- This is the first of two units implied by "the spec should be able to see it": this one makes the brief durable; the next wires `trigger/generate-spec.ts`'s prompt builder to read `Project.architectureBrief` (via `projectId`, already available to the task) and include it as its own labeled section, distinct from — and not truncated the way — the `ai-chat` feed's copy of it is.

## Check When Done

- Submitting Discovery's Generate durably records the exact composed (or hand-edited) brief text on the project; reloading the page or opening an entirely new session still reflects it.
- Re-running Discovery on a project that already has a persisted brief overwrites it — no second record, no history.
- A simulated failure of the brief-persistence write does not prevent, delay, or surface an error on the design run starting and navigating to Canvas.
- Project Home's Architecture Interview card shows "Brief composed" once a brief exists, and no status line before one does.
- No new Vercel Blob object is created as a result of this unit.
- `npm run build` passes without type errors.
