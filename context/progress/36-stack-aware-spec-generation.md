# 36 — Stack-Aware Spec Generation

Generated technical specs now carry an explicit `## Tech Stack` section, sourced from the
project's persisted Discovery brief, so a project's data-model and stack decisions are stated
outright instead of being left to whatever the model happened to restate in prose.

Two files changed. No schema, no migration, no route contract change.

## What Shipped

### `trigger/generate-spec.ts` — read the brief server-side

Between publishing the "writing your technical spec" phase and calling the generator, the task
now reads the project's brief directly:

```ts
const project = await prisma.project.findUnique({
  where: { id: projectId },
  select: { architectureBrief: true },
});
```

It is deliberately **unguarded** — no local try/catch. A database failure here is a genuine
error and belongs in the run's existing catch/retry handling, exactly like the `saveProjectSpec`
call further down. Swallowing it would silently degrade a project that *has* a brief into one
that appears not to.

The read is server-side by design: the brief must never be client-supplied, so it is fetched
from the already access-checked `projectId` in the same spirit that `projectId` itself is
resolved from the caller's access rather than trusted from the request body.

`hasBrief` was added to the existing "generate-spec produced a spec" log line, so a run's logs
say whether a brief was in play without having to reconstruct it from the project record.

### `lib/spec-agent/generate.ts` — thread it into both prompt builders

`generateSpecMarkdown` takes a new `architectureBrief: string | null` and passes it to both
builders.

`buildUserPrompt` gains its own labeled block between the canvas graph and the conversation:

```
Architecture brief (from the Discovery interview, if run):
<brief text, or "(none — this project has no recorded architecture brief)">
```

Kept distinct from "Conversation that produced it" on purpose — the brief is a set of
structured, deliberate answers; the chat history is freeform. It is passed through **whole**: it
was already bounded to 20,000 characters when persisted (`app/api/projects/[projectId]/brief/route.ts`),
so it is not truncated a second time here. The `ai-chat` feed's own copy of a brief *is* cut to
`AI_CHAT_MAX_LENGTH`, but that bound exists for chat display and has nothing to do with this run.

`buildSystemPrompt` gained `## Tech Stack` as section 4 of the required list — after
`## Architecture`, before `## Components` — with everything after it renumbered (the list is now
8 items, not 7). It also gained a new `TECH STACK RULES:` block and one new source-of-truth line
near the top of the prompt: when a brief is present it is authoritative for storage, consistency,
and stack decisions specifically, because a `cylinder` shape only means "a database or storage,"
not which kind.

## Deviations From The Spec

Two, both small.

**1. `buildSystemPrompt` now takes the brief, and branches on it.** The spec said to thread
`architectureBrief` "into both prompt builders" but did not say what the system prompt does with
it. Passing it and ignoring it would have left a dead parameter, so the `TECH STACK RULES:` block
emits only the applicable branch:

- **Brief present** → the three rules the spec names: draw from `## Data` / `## Constraints`;
  where a field reads `not specified`, say so rather than picking a default; where the brief
  conflicts with the canvas, state the brief's answer in `## Tech Stack` and raise the conflict
  under `## Open Questions`.
- **Brief absent** (`null`) → one rule: say plainly that no brief was recorded, then describe
  only what the canvas graph and conversation imply.

Both branches share the two unconditional rules — that the section is never omitted, and that
`## Tech Stack` states *what* is used while `## Technical Considerations` covers how those
choices scale, fail, and get secured.

The model is never handed rules for a situation it is not in, which is both cheaper and less
confusable than emitting all four branches every time.

**2. A missing project row throws `AbortTaskRunError`.** The spec called for `findUnique` and
said "a failed or **empty** read is a genuine error." `findUnique` returns `null` for a missing
row, and letting that collapse into "no brief" would contradict that sentence — so the null-row
case throws explicitly. `AbortTaskRunError` (not a plain throw) because `projectId` arrives
already resolved from the caller's access: a project that does not exist will not start existing
on a retry, so this is the same non-retriable class as the existing missing-`OPENAI_API_KEY`
check directly above it.

Note the two `null`s are distinct and only one is an error:

| Condition | Meaning | Handling |
| --- | --- | --- |
| `project === null` | The project row is gone | `AbortTaskRunError` — non-retriable |
| `project.architectureBrief === null` | Discovery was never run | Legitimate; flows through as `null` |

## Verified

`npm run build` passes with no type errors.

Beyond that, `generateSpecMarkdown` was called directly against the live model from a temporary
script (since removed) with four fixtures — a full brief, a brief whose stack/data fields all
read `not specified`, `architectureBrief: null`, and a brief whose `document` / `eventual`
answers deliberately contradict a canvas graph of two `cylinder` nodes joined across a relational
edge. This bypasses Trigger.dev entirely, so it needed no worker and no live project.

All four runs produced exactly:

```
Overview | Architecture | Tech Stack | Components | Data Flow | Technical Considerations | Open Questions
```

So these `## Check When Done` items are confirmed, for all four fixtures:

- `## Tech Stack` is present.
- It sits after `## Architecture` and before `## Components`.
- It is **never omitted** — including in the `architectureBrief: null` case.
- `POST /api/ai/spec`'s request body is unchanged (`payload.ts` was not touched at all, so no
  client can supply or override the brief).

### Not verified

The **content-level** checks were not confirmed. The verification script's section-body
extraction regex was broken and printed empty strings; by the time it was fixed, the OpenAI
account had hit its quota (HTTP 429, "You exceeded your current quota") and the re-run never
reached the model. The four generated documents from the first run were not captured.

Still unconfirmed, therefore:

- That an unspecified brief field is reported as such rather than filled with an invented stack.
- That a `null` brief produces a section which says so plainly.
- That a brief/canvas conflict lands the brief's answer in `## Tech Stack` and the conflict in
  `## Open Questions`.
- That `## Technical Considerations` does not simply re-list what `## Tech Stack` already named.

These are all prompt-adherence properties, not code paths — the code that feeds them is
confirmed correct. Re-run the same four fixtures once the OpenAI quota is restored, or read a
real generated spec through the Specs tab.

## Left Undone

Nothing in scope. The scope limits held: `trigger/design-agent.ts` and `lib/design-agent/plan.ts`
are untouched, so the *drawn canvas* still does not honour the brief's stack answers — that
remains a separate follow-up behind a different task and a different route boundary
(`/api/ai/design`). `lib/architecture-brief.ts`, `lib/spec-agent/payload.ts`, and
`lib/spec-agent/storage.ts` were not modified.
