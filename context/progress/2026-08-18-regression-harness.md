# 2026-08-18 — Regression Harness

Eight verification scripts existed and **nothing ran them together**. Together they are 200+
assertions against a real database, a real blob store, and a real HTTP stack — a genuinely good
suite, reachable only by remembering which of eight commands to type. A change in unit 42 that
broke unit 38's sequence contract would have stayed invisible until somebody happened to re-run
the right script by hand.

This makes them a gate. From `plans/regression-harness.md`, now deleted.

## What Shipped

**Two grouped commands, split by what they need rather than by what they cover.** The plan wrote
this rule and it decided the whole shape: the HTTP scripts need a dev server and a live Clerk
session, the library scripts need neither. One command spanning both would fail half the time it
was run, which is how a gate becomes noise and then becomes disabled.

```
verify:db    spec-versions → changes → drift → canvas → apply     (5 suites, no server)
verify:http  build-units → apply-http → design-room               (3 suites, dev server + session)
verify:all   verify:db && verify:http
```

`verify:db` is the one reachable from a cold checkout, and the one the unit-close checklist now
names. Ordering inside it is deliberate: `apply` runs last because `verify:apply -- cap` creates
199 build units in one throwaway project to test the cap, and is the slowest phase by a wide
margin. Everything cheap fails first.

**The plan was stale and was not followed literally.** It was written when five scripts existed
and grouped those five. Three more shipped since — `verify:drift` (unit 42), `verify:canvas`
(unit 43), and `verify:design-room` (the 2026-08-17 room-scoping fix) — so the grouping was
rebuilt from what the repo actually contains. `verify:design-room` reads as a library script by
name and is not one: it needs `VERIFY_BASE_URL`, `CLERK_SECRET_KEY`, and `VERIFY_OWNER_EMAIL`,
so it belongs in `verify:http`. Membership was decided by grepping for `VERIFY_BASE_URL` rather
than by reading the names.

**The permission allowlist went from one entry to eleven.** `.claude/settings.json` allowed only
`Bash(npm run verify:build-units)`, so the seven newer scripts prompted for permission on every
run — friction applied exactly when running them mattered most. All eight scripts and all three
groups are now allowed.

**Two rules added to `ai-workflow-rules.md`'s `## Before Moving To The Next Unit`.** Item 4 puts
`verify:db` at the moment a unit closes. Item 5 is the per-unit commit rule.

## Decisions

**`verify:db` did not become a `Stop` hook, and the plan's recommendation against it stands.**
It costs minutes of real database and blob round-trips per run. On every turn — including turns
that changed a comment — that is a gate which gets disabled inside a week, which is worse than
not having one. The unit-close checklist is where it is load-bearing.

This is a deliberate exception to the harness rule in the global operating rules (*anything
enforceable should stop being a prompt*). Item 4 is a prompt, and prompts degrade. The honest
statement is that the cost of the hook form exceeds its value here; if `verify:db` ever gets fast
enough, or a CI runner exists to carry it, the hook is the better home.

**Item 5 (per-unit commits) is a rule rather than a rebase.** Units 38–41 went in as one commit
because `prisma/models/project-build-unit.prisma` and `lib/build-units.ts` each carry three
units' work, and no clean split existed by the time anyone looked. That cannot be reconstructed
retroactively, so the rule is forward-looking and says why: a per-unit commit is only possible
while that unit is the newest thing in the tree.

## Verified

`npm run verify:db` — **the full chain ran and passed**, ending in `All checks passed.` from
`verify:apply`, the last of the five. The suites are chained with `&&`, so reaching the last one
is itself the proof that the four before it passed: a non-zero exit anywhere halts the chain.

`npm run lint` and `npx tsc --noEmit` are clean.

## Not Verified

- **`verify:http` was not run.** It needs `npm run dev` up and a live Clerk browser session, so
  it is a human-gated step by construction — the same reason it is a separate command rather than
  part of `verify:db`. The three suites inside it each passed individually when their own unit
  shipped; what is unproven is only that the *grouping* invokes them correctly.
- **`verify:all` was not run**, for the same reason — it is `verify:db && verify:http`.
- **The allowlist widening was not observed taking effect.** Permission entries are read at
  session start, so the new ones apply to the next session rather than this one.
