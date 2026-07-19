Add a guided "architecture interview" to the AI Architect tab: a short, skippable set of questions that composes a structured project brief and feeds it to the existing design generation path in place of a one-line prompt, so generated architectures are grounded in real requirements. The interview is an additional entry alongside the existing freeform prompt — it changes only the prompt text that is submitted, not how generation runs.

## Implementation

1. Create the brief model and question catalog: `lib/architecture-brief.ts`.
   - Export the fixed catalog of interview questions (the content below) plus the answer and brief types. This module is pure: no React, no Liveblocks, no `@xyflow/react` imports — it is consumed by a client component and must stay free of that bundle coupling (mirror the type-only discipline in `lib/spec-agent/payload.ts`).
   - Every option set is a fixed enum so answers stay bounded and machine-usable (reuse the `z.enum` / `Record<Key, true>` bounding idiom from `lib/spec-agent/payload.ts`; adding an option should be a one-line change that the composer covers).
   - The seven core questions, in order:
     1. **Building & users** — free text ("what are you building?") + actor multi-select: `end-users`, `internal-staff`, `admins`, `other-systems`.
     2. **Scale & growth** — tier single-select: `prototype` (<1k), `growing` (1k–100k), `large` (100k–1M+), `massive`; growth single-select: `flat`, `steady`, `spiky`.
     3. **Data & behavior** — entities free text + shape multi-select: `relational`, `document`, `key-value`, `graph`, `time-series`, `files`; consistency single-select: `strong`, `eventual`.
     4. **Real-time need** — single-select: `live`, `fast` (<1s), `normal`, `batch`.
     5. **Integrations** — multi-select: `auth`, `payments`, `email-sms`, `file-storage`, `external-apis`, `internal-systems` + free text for specifics.
     6. **Reliability & compliance** — availability single-select: `best-effort`, `high`, `critical`; compliance multi-select: `none`, `pii-gdpr`, `hipaa`, `pci`, `other`.
     7. **Constraints** — team size + preferred stack/cloud (free text) + priority single-select: `simple` … `scale`; budget single-select: `tight`, `moderate`, `flexible`.
   - One optional eighth question — **Mandates & out of scope** — free text for hard mandates and explicit non-goals.
   - Each question declares a `default` used when it is skipped. Skipping is always allowed; nothing is required.

2. Add the deterministic brief composer to `lib/architecture-brief.ts`.
   - Export `composeBrief(answers, initialIdea): string` returning a Markdown brief with one section per question (`## Users & Scope`, `## Scale`, `## Data`, `## Real-time`, `## Integrations`, `## Reliability & Compliance`, `## Constraints`, `## Mandates & Out of Scope`) plus a trailing `## Assumptions` list.
   - Composition is fully deterministic in this unit — no AI/model call. The `## Summary` restates `initialIdea` (the text already typed into the freeform prompt, if any) followed by a one-line composed description built from the answers.
   - Every question that was skipped or left at its default is recorded as one line under `## Assumptions`, so a default is never silently applied.
   - Keep the composed string bounded: fixed section labels, enum-derived values, and free-text fields truncated to a sane cap (follow the truncate-don't-reject stance for human-typed fields in `lib/spec-agent/payload.ts`).

3. Build the interview UI: `components/editor/ai/architecture-interview.tsx`.
   - A stepped flow in a shadcn `Dialog` (follow the `spec-preview-dialog.tsx` precedent for the Dialog, `ScrollArea`, and `rounded-3xl` modal scale) launched from the AI Architect tab.
   - One question per step, with a step indicator, `Back` / `Next`, and a `Skip` control on every step. Answers are held in local React state only.
   - Render option sets as selectable pill chips (single- or multi-select per question); reuse the starter-chip pill treatment already in the AI Architect tab and the selected-state token pattern used by the tool panel (`bg-accent-dim text-brand`) so a chosen chip is visually distinct from rest and hover.
   - The final step is **Review**: show `composeBrief(...)` output in an editable `Textarea` so the user can adjust the brief before generating, and a `Generate` button.
   - `Generate` submits through the *existing* design path — do not add a new route, token call, or realtime hook. Reuse the exact submit already wired in `ai-architect-tab.tsx` (units 22/26: `POST /api/ai/design` → `/api/ai/design/token` → `useRealtimeRun`); the only difference is that the submitted `prompt` is the composed (and possibly edited) brief. The button's loading state is driven by the same run status the freeform prompt already uses.

4. Wire the interview into `components/editor/ai/ai-architect-tab.tsx`.
   - Add a "Guided brief" affordance next to the existing freeform prompt input that opens the interview Dialog. Pre-fill the interview's `initialIdea` with whatever is currently in the freeform textarea.
   - Do not rebuild the freeform prompt input, the starter chips, or the chat feed — the interview is an additional entry point that reuses the same generation path.

## Dependencies

Already installed:

- shadcn `Dialog`, `ScrollArea`, `Textarea`, `Button` (used by units 20 and 29)
- the AI SDK design agent, `POST /api/ai/design`, its token route, and `useRealtimeRun` (units 22–26)

To install:

- none.

No new environment variables. `OPENAI_API_KEY` already backs the design agent and is unchanged.

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors. Reference `context/ui-context.md` for layout and modal conventions.
- Selected chip: `bg-accent-dim text-brand` (the tool-panel active pattern). Rest: `text-copy-muted`. Hover: `bg-elevated`. Follow the AI Architect tab's soft-pill chip shape.
- `Generate` uses the same accent button treatment as the existing send action (`bg-accent text-white`).
- Component states to cover: chip default / selected / hover; step nav `Back` disabled on step 1, `Next` always enabled (all questions skippable); `Skip` on every step; Review `Generate` default / loading (tied to run status) / error surfaced the same way the freeform prompt surfaces run errors.
- Keep the Dialog scannable: one question per step, help text under each question, the step indicator visible throughout.

## Scope Limits

- do not add a new API route or background task — reuse `POST /api/ai/design` and its existing token/realtime path.
- do not add a Prisma model or persist the brief — it is composed client-side and passed as the prompt; persistence is a later unit.
- do not add an AI/model call to pre-fill answers or write the summary — composition is deterministic in this unit; AI enrichment is a later unit.
- do not rebuild the freeform prompt input, starter chips, or the chat feed.
- do not change the design agent, the canvas, Liveblocks, or presence/status behavior.
- do not introduce a state system outside React local state and the existing room usage.
- do not introduce new colors — reuse existing tokens only.

## Notes

- Read `context/project-overview.md`, `context/architecture-context.md`, `context/ui-context.md`, and `context/ai-workflow-rules.md` before implementing.
- Reuse the design submission wiring already in `ai-architect-tab.tsx` (units 22/26) rather than duplicating trigger/token/realtime logic — this is the invariant that keeps the unit small.
- Keep `lib/architecture-brief.ts` framework-free and unit-testable, following the pure-function + bounded-field pattern in `lib/spec-agent/payload.ts`.
- The composed brief is the seam that a future unit (AI pre-fill from the initial idea, or research/document ingestion) will fill; keep its shape stable.

## Check When Done

- A "Guided brief" entry in the AI Architect tab opens the interview Dialog, pre-filled with any text already in the freeform prompt.
- All seven core questions render as steps with chip/text inputs; the optional eighth appears after them.
- Every step can be skipped, and each skipped or defaulted question appears as a line under `## Assumptions` in the composed brief.
- The Review step shows the composed Markdown brief, and edits made there are what get submitted.
- `Generate` runs the existing design path: a `TaskRun` is created and the canvas updates through the existing collaborative flow — no second generation path exists.
- The freeform prompt path still generates exactly as before.
- `composeBrief` is deterministic: the same answers produce the same brief, and skipped answers surface under `## Assumptions` (unit-testable without the browser).
- No new colors are introduced; only existing tokens are used.
- `npm run build` passes without type errors.
