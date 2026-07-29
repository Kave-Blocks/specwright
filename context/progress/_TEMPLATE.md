# Progress File Conventions

One file per unit of work. `context/feature-specs/NN-name.md` says what to build; the file here
says what actually happened. There is no required section structure — a progress file is a
narrative, and over-templating it fights its own purpose. Write what this project already
writes: what shipped, what deviated from the spec and why, what was verified and how, and what
was left undone.

## File Naming

- **Spec-driven unit** → `NN-name.md`, the **same number and name** as its
  `context/feature-specs/NN-name.md`. Never reuse a number, never renumber.
- **Non-spec work** — a rename, branding, a QA sweep touching several unrelated units →
  `YYYY-MM-DD-short-slug.md`.

## Follow-ups

A later fix or QA finding against a unit that already has a file goes into **that same file** as
a new section:

```markdown
### Follow-up — YYYY-MM-DD
```

Never a new top-level bullet in `progress-tracker.md`, and never a new standalone file for a
mere fix.

A follow-up that does not belong to one unit — it spans several, or is not spec-driven work —
gets its own `YYYY-MM-DD-short-slug.md` instead.

**Genuinely new capability** built later still gets its own new file, even when it touches a
past unit. Unit `32` (hand tool) is its own file although it builds on `31`'s tool-mode system,
because it is new capability, not a fix. `Follow-up` sections are for fixes and QA findings only.

## The Index Row

Every file has exactly one row in `progress-tracker.md`'s `## Unit Index` (or its `### Other
work` table). Edit that row in place — never append a second row for the same unit.

| Column | Values |
| --- | --- |
| Status | `specced` · `in progress` · `shipped` · `deferred` · `blocked` |
| Verified | `browser` · `structural` · `partial` · `none` |
| Summary | ~15 words. The detail lives in the linked file, not here. |

`browser` means driven through a real browser session. `structural` means types/build/lint, unit
tests, or direct DB/API round-trips outside the actual UI. `partial` means some
`## Check When Done` items were browser-verified and others were not — the file must say which.
