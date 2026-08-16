# Regression Harness — Make The Verify Scripts Run Together

**Closes:** the absence of any cross-unit regression safety
**Blocked on:** nothing
**Effort:** ~30 minutes

## What the gap is

Five verification scripts exist and **nothing runs them together**:

| Script | Layer | Needs |
| --- | --- | --- |
| `verify:build-units` | HTTP | dev server + live Clerk session |
| `verify:spec-versions` | library / DB | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` |
| `verify:changes` | library / DB | same |
| `verify:apply` | library / DB | same |
| `verify:apply-http` | HTTP | dev server + live Clerk session |

Together they are 150+ assertions against a real database, a real blob store, and a real HTTP
stack — a genuinely good suite. But there is no `npm test`, no CI, and no single command. A change
in unit 42 that breaks unit 38's sequence contract would stay invisible until somebody
*remembered* to re-run a script by hand.

`.claude/settings.json` also allows only `Bash(npm run verify:build-units)`, so the four newer
scripts prompt for permission on every run — friction that makes "just run them" less likely
exactly when it matters.

There is a second, related gap this plan closes: **units 38–41 were committed as one commit**
(`a99b4e7`), because their files are genuinely entangled — `prisma/models/project-build-unit.prisma`
and `lib/build-units.ts` each carry three units' work, so no clean per-unit split existed by the
time anyone looked. That is water under the bridge; the fix is forward-looking, in step 4.

## Why it matters

Your own harness rule: *if the model ignored every word of the prompt, what would still be true?*
Right now, nothing about regression. The scripts are a wish, not a gate. This makes them a gate.

## Steps

### 1. Add a grouped command

The two HTTP scripts need a dev server and a live session; the three library scripts need neither.
Group them accordingly rather than making one command that fails half the time.

In `package.json`:

```jsonc
"verify:db": "npm run verify:spec-versions -- all && npm run verify:changes -- all && npm run verify:apply -- all",
"verify:http": "npm run verify:build-units -- all && npm run verify:apply-http -- all",
"verify:all": "npm run verify:db && npm run verify:http"
```

`verify:db` is the one that should be reachable from a cold checkout. `verify:http` is the one
that needs a person to have a browser session alive.

### 2. Widen the permission allowlist

In `.claude/settings.json`:

```jsonc
"permissions": {
  "allow": [
    "Bash(npm run verify:build-units)",
    "Bash(npm run verify:spec-versions)",
    "Bash(npm run verify:changes)",
    "Bash(npm run verify:apply)",
    "Bash(npm run verify:apply-http)",
    "Bash(npm run verify:db)",
    "Bash(npm run verify:http)",
    "Bash(npm run verify:all)"
  ]
}
```

### 3. Decide whether `verify:db` becomes a hook

**Recommendation: not yet.** A `Stop` hook running `verify:db` costs ~2 minutes of real database
and blob round-trips on **every** turn, including turns that changed a comment. That is the kind
of gate that gets disabled within a week, which is worse than not having it.

The middle ground worth taking instead: run `verify:db` **at the end of each unit**, before
recording progress, and say so in `context/ai-workflow-rules.md` under
`## Before Moving To The Next Unit`:

```markdown
4. `npm run verify:db` passes, so the unit did not silently break an earlier one.
```

That puts it where it is actually load-bearing — the moment a unit closes — rather than on a timer.

### 4. Write the commit rule down

Units 38–41 could not be split retroactively because their shared files were already entangled.
The fix is a rule, not a rebase. Add to `context/ai-workflow-rules.md`, in
`## Before Moving To The Next Unit`:

```markdown
5. The unit is committed on its own, before the next unit starts. Shared files
   (`lib/build-units.ts`, `prisma/models/*.prisma`) accumulate several units' work, so a
   per-unit commit is only possible while that unit is the newest thing in the tree — it
   cannot be reconstructed later.
```

### 5. Prove the grouped commands actually run

```bash
npm run verify:db
```

Expect three suites and `All checks passed.` three times — 35 + 44 + 59 assertions. Then, with
`npm run dev` up and a live Clerk session:

```bash
npm run verify:http
```

Expect 5 + 4 + 36 assertions and `left behind: nothing` from the build-units summaries.

## A known cost, so it is not a surprise

These scripts create and delete **real** rows in the hosted Postgres and upload **real** blobs.
Every run:

- burns sequence numbers on its throwaway projects (by design — counters never roll back)
- leaves unreferenced blobs behind when rows cascade away (inert, exactly as for any change
  discarded in the app)

Throwaways are prefixed `verify-spec-versions-`, `verify-change-proposals-`,
`verify-change-application-`, `verify-apply-http-`, and `verify-build-units-`. If a run is killed
mid-flight the `finally` may not fire — those prefixes are how you find and delete strays.

`verify:apply -- cap` creates **199 build units** in one throwaway to test the cap. It is the
slowest phase by a wide margin; if `verify:db` feels slow, that is why.

## What to do with the result

1. Record it in a `context/progress/YYYY-MM-DD-regression-harness.md` — it spans units, so it is
   non-spec work and gets its own dated file rather than a follow-up.
2. Add a row to `### Other work` in `context/progress-tracker.md`.
3. Delete this plan and its row in [`README.md`](README.md).
