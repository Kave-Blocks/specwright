# Feature Spec Structure

The required structure for every file in `context/feature-specs/`. Derived from units 01–29; units 11+ are the reference shape.

A spec is an instruction set for an implementer who has not read the codebase. It says what to build, what to reuse, what not to touch, and how to prove it works. It does not contain code.

## File Naming

`NN-kebab-case-name.md` — two-digit sequence, one unit of work per file, single `.md` extension.

The number is the build order. Never reuse a number and never renumber an existing spec.

## Section Order

| Section | Required | Purpose |
| --- | --- | --- |
| Summary (no heading) | Yes | What this unit delivers, in 1–2 sentences |
| `## Implementation` | Yes | Numbered steps, in build order |
| `## Dependencies` | Only if packages/env are involved | What is already installed vs. what must be added |
| `## UI Details` | Only if the unit renders UI | Tokens, states, layout constraints |
| `## Scope Limits` | Yes | What this unit must not change |
| `## Notes` | Optional | Context files to read, patterns to reuse |
| `## Check When Done` | Yes | Verifiable pass/fail conditions |

Use `##` for all top-level sections. No H1 title — the filename is the title.

## Section Rules

### Summary

Opens the file, no heading. States the user-visible outcome, not the tasks.

> Wire up the AI sidebar so users can submit design prompts, track AI run status in real time, and reflect AI-driven canvas updates through Liveblocks.

### Implementation

Numbered steps. Each step is one file, route, or coherent behavior, and names its target path (`trigger/generate-spec.ts`, `POST /api/ai/spec`). Sub-bullets describe behavior and constraints.

Describe behavior, not code. Say "save the label on blur, Enter, or Escape" — not the handler. Where an existing utility must be used, name it and say to reuse it rather than reimplement it (`useLiveblocksFlow`, `EdgeLabelRenderer`, `getSmoothStepPath`). Call out security and data invariants inline where they apply ("do not trust a client-supplied `projectId`").

### Dependencies

Split explicitly into already installed and to be installed. Name env vars the unit needs and state whether they already exist in `.env.local`.

### UI Details

Only for units that render. Reference the tokens in `globals.css` and the conventions in `ui-context.md` — never introduce a new color, and quote hex values only when repeating an existing token (e.g. the `#62C073` accent). Cover component states (default, hover, disabled, loading, error) and say what layout must stay intact.

### Scope Limits

Negative constraints, one per line, imperative. This is what keeps a unit from sprawling — it exists to prevent the adjacent-system rewrite, not to restate the implementation.

> - don't change how nodes are created
> - don't introduce a new state system outside Liveblocks
> - don't bypass existing collaborative flow utilities

### Notes

Which context files to read before implementing (`context/project-overview.md`, `context/architecture-context.md`, `context/ui-context.md`), which agent skills apply (Liveblocks, Trigger.dev), and which existing patterns to follow (Zod for validation, Prisma for persistence, existing auth flow).

### Check When Done

Each line is independently verifiable by inspecting the running app or the built output — a reviewer can mark it pass or fail without judgment. Cover the behavior the summary promised, plus every invariant asserted in Implementation.

The last line is always the build check:

> - `npm run build` passes without type errors.

## Template

```markdown
<One to two sentences: what this unit delivers and why it matters to the user.>

## Implementation

1. <First step — name the file or route it touches.>
   - <behavior>
   - <constraint>
   - <existing utility to reuse>

2. <Second step.>
   - <behavior>

## Dependencies

Already installed:

- <package>

To install:

- <package>

<Env vars this unit needs, and whether they already exist.>

## UI Details

- Use existing design tokens from `globals.css` — do not introduce new colors.
- Follow `context/ui-context.md` for layout and visual consistency.
- <component states: default, hover, disabled, loading, error>

## Scope Limits

- do not <adjacent system this unit must not touch>
- do not <abstraction that must not be introduced>
- do not <existing pattern that must not be bypassed>

## Notes

- Check `context/project-overview.md` and `context/architecture-context.md` before implementing.
- Reuse existing <auth / Prisma / Trigger.dev / Liveblocks> patterns.

## Check When Done

- <verifiable outcome tied to the summary>
- <verifiable outcome for each invariant in Implementation>
- `npm run build` passes without type errors.
```

## Known Deviations

Existing specs that do not match this structure. Fix on next edit; do not renumber.

- `01`, `02`, `07`, `26`–`29` use `###` for top-level sections instead of `##`.
- `04` and `05` carry an H1 title; the rest do not.
- `01` and `02` use `### Check when done` (lowercase `when`).
- `03`–`10` use domain headings (`## Models`, `## Routes`, `## Access`) in place of `## Implementation`.
