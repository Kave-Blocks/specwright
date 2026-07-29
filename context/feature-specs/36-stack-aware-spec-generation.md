Give the generated technical spec its own explicit `## Tech Stack` section, sourced from the Discovery interview's persisted Data and Constraints answers, so a project's data-model and stack decisions are stated outright in the spec instead of being buried in prose the model may or may not restate.

## Implementation

1. `trigger/generate-spec.ts` — before calling `generateSpecMarkdown`, read the project's persisted brief.
   - `prisma.project.findUnique({ where: { id: projectId }, select: { architectureBrief: true } })`, following the same direct-Prisma-read style `lib/spec-agent/storage.ts`'s `saveProjectSpec` already uses elsewhere in this task.
   - `projectId` is already validated by the time it reaches this task (`POST /api/ai/spec` resolves it server-side from the caller's access — see `lib/spec-agent/payload.ts`'s comment on `generateSpecPayloadSchema`), so a failed or empty read is a genuine error, not a best-effort side write. Do not wrap it in its own try/catch — let it surface through the run's existing catch/retry handling, the same as the unguarded `saveProjectSpec` call below it.
   - Pass the result (`string | null`) into `generateSpecMarkdown` as a new `architectureBrief` parameter.

2. `lib/spec-agent/generate.ts` — thread `architectureBrief: string | null` through `generateSpecMarkdown` into both prompt builders.
   - `buildUserPrompt`: add a new labeled block between the canvas graph and the conversation — `"Architecture brief (from the Discovery interview, if run):"` followed by the brief text, or a plain `"(none — this project has no recorded architecture brief)"` when `null`. Keep it a distinct section, not merged into "Conversation that produced it" — the brief is structured, deliberate answers; the chat history is freeform. Pass it through whole: it is already bounded to `MAX_BRIEF_LENGTH` (20,000 characters) at the point it was persisted (`35-brief-persistence.md`), so this unit does not truncate it again — unlike the `ai-chat` feed's own copy of a brief, which is cut to `AI_CHAT_MAX_LENGTH` for a different reason (chat display, not this run).
   - `buildSystemPrompt`: insert a new required section into the numbered list, after `## Architecture` and before `## Components` (renumbering the rest): `## Tech Stack` — the concrete data model, consistency model, and preferred stack/cloud, drawn from the brief's `## Data` and `## Constraints` sections when a brief exists.
     - When the brief states a field as "not specified" (the brief's own composer already prints that phrase for a skipped free-text or multi-select field — see `lib/architecture-brief.ts`), say so plainly in this section rather than guessing or inventing a stack. Do not read absence as license to fill in a default.
     - When no brief exists at all (the passed-in value is `null`), state that plainly too, and describe whatever the canvas graph and conversation imply instead — this section is never omitted, unlike the existing "omit `## Open Questions` if nothing is unresolved" rule.
     - When the brief's stated Data/Constraints answers conflict with what the canvas graph actually shows (e.g. the brief says "document" but the graph's `cylinder` nodes and edges clearly describe a relational, multi-table join pattern), state the brief's answer in `## Tech Stack` and flag the conflict under `## Open Questions` — do not silently let one override the other.
     - Add one line clarifying the boundary with the existing `## Technical Considerations` section: `## Tech Stack` states *what* is used; `## Technical Considerations` covers how those choices scale, fail, and get secured. It should not re-list the stack `## Tech Stack` already named.
   - Add one rule near the existing "canvas is the source of truth for what the system contains" line: the brief, when present, is the authoritative statement for storage/consistency/stack decisions specifically — a bare `cylinder` shape only means "a database or storage," not which kind, so the brief's `Data shapes` and `Consistency` answers (not the shape alone) are what ground this section.

## Scope Limits

- do not touch `trigger/design-agent.ts` or `lib/design-agent/plan.ts` — the canvas graph itself does not get stack-aware node labels or constraints in this unit. The brief already reaches the design agent today as part of the raw prompt text when submitted from Discovery, but nothing there enforces it against the drawn graph. Making the *drawing* honor the brief's stack answers is a separate follow-up: a different Trigger task and a different API route boundary (`/api/ai/design`, not `/api/ai/spec`), which this project's own scoping rules keep out of one unit.
- do not add a new Prisma model, column, or migration — `Project.architectureBrief` already exists (`35-brief-persistence.md`); this unit only reads it.
- do not add `architectureBrief` (or any brief content) to `specRequestSchema` or `generateSpecPayloadSchema` in `lib/spec-agent/payload.ts` — it must never be client-supplied. It is fetched server-side from the already-access-checked `projectId`, exactly how `projectId` itself is resolved rather than trusted from the request body.
- do not change `## Overview`, `## Components`, `## Data Flow`, or `## Open Questions`'s existing rules beyond referencing the new section — this is a narrow addition, not a spec-format rewrite.
- do not add a new field to `ProjectSpec` or change how a spec is persisted — `## Tech Stack` is just a section inside the one Markdown document `saveProjectSpec` already stores unchanged.
- do not modify `composeBrief`, `BriefAnswers`, or the question catalog in `lib/architecture-brief.ts` — this unit only reads the already-composed brief text; it needs no per-field structured access, since `composeBrief` already prints `Data shapes`, `Consistency`, and `Preferred stack / cloud` as their own labeled lines.
- do not change what happens when a project has no brief — Discovery and Canvas behavior are untouched; this unit only changes what `generate-spec` does with whatever `Project.architectureBrief` already holds (including `null`).

## Notes

- Read `context/architecture-context.md` (Storage Model) before implementing.
- This is the follow-up `35-brief-persistence.md`'s own Notes section named as the natural next unit: wiring `trigger/generate-spec.ts`'s prompt builder to read `Project.architectureBrief` as its own labeled section. This unit scopes that specifically to the Data/Constraints (tech-stack) half becoming an explicit, checkable spec section, rather than dumping the whole brief in with no structural change to the output.
- The brief text needs no parsing here — `composeBrief`'s `## Data` and `## Constraints` sections already print exactly the lines this unit's system-prompt instructions point the model at (`Data shapes`, `Consistency`, `Preferred stack / cloud`), including the literal `not specified` phrase for a skipped field. The model reads the same prose a human reviewer would.

## Check When Done

- Generating a spec for a project with a persisted architecture brief produces Markdown containing a `## Tech Stack` section, positioned after `## Architecture` and before `## Components`, that states the brief's Data shapes, Consistency, and Preferred stack/cloud answers.
- Generating a spec for a project whose brief left the stack/data-shape fields unspecified produces a `## Tech Stack` section that says so plainly rather than naming an invented stack.
- Generating a spec for a project with no persisted brief (`architectureBrief` is `null`) still produces a `## Tech Stack` section — never omitted — stating that no brief was recorded and describing whatever the canvas graph and conversation imply.
- A brief whose Data/Constraints answers conflict with what the canvas graph shows results in `## Tech Stack` stating the brief's answer and the conflict being raised under `## Open Questions`, not silently resolved either way.
- `## Technical Considerations` in a freshly generated spec does not simply re-list what `## Tech Stack` already named.
- The request body accepted by `POST /api/ai/spec` is unchanged — no client can supply or override `architectureBrief`.
- `npm run build` passes without type errors.
