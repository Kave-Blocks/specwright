# Browser Verification — Unit 40's Failure UI (what remains)

**Closes:** the one unit 40 state that has never rendered
**Blocked on:** nothing — needs a Trigger.dev worker and one deliberate misconfiguration
**Effort:** ~20 minutes

> **Passes 1 and 1b are done (2026-08-16).** Unit 41's UI and unit 42's drift notice were both
> driven in a real signed-in browser. Results are in
> [`../progress/41-change-application.md`](../progress/41-change-application.md) and
> [`../progress/42-spec-drift.md`](../progress/42-spec-drift.md) under `### Follow-up — 2026-08-16`.
> Both units' `Verified` levels moved. What follows is the only part left.

## What the gap is

**Unit 40's proposal-failure UI has never rendered.** Every QA run succeeded, so the terminal error
presentation — `settle(failed, failureText)` preferring the run's own published message over the
generic line, which is the exact regression unit 37 fixed — has not been observed live.

This was previously entangled with the exhausted OpenAI quota. It no longer is: **the quota was
restored 2026-08-16**, so a *successful* run is now also possible, and the failure has to be forced
deliberately rather than arriving for free.

## Why it matters

Unit 37's whole point is that a failure explains itself honestly instead of saying "please try
again" about something that cannot succeed. That fix is verified at the classification layer and
never at the surface a person actually reads. If `RUN_FAILED_ERROR` has crept back in front of the
published message, nothing currently in the repo would notice.

## Setting up the state

`scripts/seed-browser-fixture.ts` creates a project with a spec, spec-attributed build units, and a
stored proposal, owned by a real Clerk account, with **no model call and no borrowed session**:

```
npx tsx scripts/seed-browser-fixture.ts --email <the signed-in account>
npx tsx scripts/seed-browser-fixture.ts --cleanup     # afterwards
```

Any project with a spec works — unit 40 refuses a proposal only when there is **no** spec.

## The pass

**Dispatch to `browser-qa`**, not the main session: a browser pass returns page snapshots and
screenshots, and those belong in a cheap subagent that reports back in prose.

Forcing a genuine task failure is cheap and does **not** require exhausting the quota.

1. In `.env.local`, point the change model at a name that does not exist:
   `CHANGE_MODEL=gpt-does-not-exist`
2. Restart `npm run trigger:dev` so the worker picks it up.
3. Submit a change request from `/editor/{projectId}/changes` on a project that **has** a spec.
4. Watch the request form settle.

**What to check:**
- The form leaves its busy state rather than hanging — the run settles.
- The message shown is the one the **run published** (`runFailureText` reading the `error` phase's
  text), not the generic `RUN_FAILED_ERROR` fallback. This is unit 37's regression; seeing the
  generic line here means it has come back.
- The typed request is **not** cleared — a refusal a person can act on needs their words still on
  screen.
- The message renders with `role="alert"` and `text-error`.
- Submitting again afterwards works: `settledRunRef` must not leave the form permanently disabled
  for a second run in the same session.

5. **Restore `CHANGE_MODEL`** and restart the worker.

## Two loose ends worth folding in

Neither is unit 40's, both are cheap while a browser is already open:

- **The build row's hover treatment.** A pixel diff of hover against rest showed *zero* difference,
  which would contradict `ui-context.md`'s claim that badge contrast holds "under the row's
  `hover:bg-elevated`". The class **is** present (`build-unit-row.tsx:284`) and the diff was taken
  on an already-expanded row, so this is most likely a mis-targeted hover. One deliberate hover on a
  **collapsed** row settles it.
- **The sidebar overlay at ~700px.** At that width the sidebar becomes a full-width overlay that
  dims the build list behind it, so the row cannot be read until it is dismissed. This is layout
  behaviour, not a badge or unit 41 problem, but nothing records it. Confirm and, if real, it wants
  its own unit rather than a patch in the moment.

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` to `context/progress/40-change-proposals.md`, quoting the
   actual message the run published.
2. If the hover check settles, add a line to `41-change-application.md`'s follow-up, which currently
   records it as unresolved.
3. Update `context/progress-tracker.md`: unit 40 drops its "failure UI never observed" line.
4. Delete this plan and its row in [`README.md`](README.md).
