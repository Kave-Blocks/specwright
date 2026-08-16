# Browser Verification — Unit 41's UI and Unit 40's Failure State

**Closes:** unit 41's entire UI surface, plus the one unit 40 state that never rendered
**Blocked on:** nothing — this is dispatchable now
**Effort:** ~45 minutes across two passes

## What the gap is

**Unit 41 has no browser pass at all.** Its behaviour is proven at two layers — 59 library checks
against real Postgres and Blob, 36 HTTP checks against a live dev server with a real Clerk
session — but nothing it *renders* has ever been seen:

- the Apply control on an expanded `proposed` change
- the stale-change notice, its two version numbers, and its second confirmation
- the outcome report (created / superseded counts, and the skipped-titles list)
- the "replaced by change {n}" badge on a build row, **beside** the status and verification
  badges rather than instead of them
- the "Not superseded" clear control in the expanded row
- the settled-state line on an applied or discarded change

**Unit 40's proposal-failure UI never rendered either.** Every QA run succeeded, so the terminal
error presentation — `settle(failed, failureText)` preferring the run's own published message
over the generic line, which is the exact regression unit 37 fixed — has not been observed live.

## Why it matters

Unit 41's central claim is *visual*: a superseded unit must visibly read `Shipped` **and**
`Browser` **and** "replaced by change 4" at the same time. The database proves all three columns
hold their values; only a browser can prove the row actually *shows* all three, in that order,
at a legible contrast. That is the one claim the two existing harnesses structurally cannot make.

The badge is also a new use of the house treatment at `text-copy-muted` on `bg-base` — the tone
pairing unit 38 spent three follow-ups getting to 5.16:1. A fourth badge on the row is where
crowding would first show.

## Pass 1 — Unit 41's UI

**Dispatch to `browser-qa`**, not the main session: a browser pass returns page snapshots and
screenshots, and those belong in a cheap subagent that reports back in prose.

### Setting up the state

Do **not** hand-build a project. `scripts/verify-change-application-http.ts` already has a
`seed()` that creates exactly the required state — a project with a spec, two `SHIPPED` /
`BROWSER` units, and a hand-authored stored proposal — with no model call. Seed one and leave it
undeleted:

1. Temporarily comment out the `finally { await d.prisma.project.delete(...) }` in the `apply`
   phase, or add a throwaway phase that seeds and returns the project id.
2. `npm run verify:apply-http -- apply` and note the project id from the output.
3. Open `/editor/{projectId}/changes` in the browser as the signed-in account.
4. **Delete the project afterwards** — it is prefixed `verify-apply-http-`, so it is easy to spot.

For the **stale** state, run `stalePhase`'s setup: seed, then call `saveProjectSpec` once more so
the project is on v2 while the change still points at v1.

### What to check

**Changes view, expanded `proposed` change:**
- Apply and Discard both present; Apply carries the primary treatment (`bg-brand text-white`).
- Applying shows a pending spinner and the "Applying…" label, then the outcome report.
- The outcome report states created and superseded counts with correct plural agreement, and
  lists skipped titles by name when there are any. Seed a proposal whose first proposed title
  duplicates an existing unit to see this branch.
- After applying, the status badge flips to `Applied` and **both actions disappear**, replaced by
  the settled line.

**Stale change:**
- The notice renders **inside the proposal body**, above the actions, with `role="alert"`.
- It names both versions in prose ("reasoned against spec version 1, but the project is now on
  version 2").
- The Apply button is **gone** while the notice is up — the confirm inside it is the only way
  forward.
- The confirm button reads "Apply anyway against v2" and applying from it succeeds.
- Nothing retries on its own: the refused request fires exactly once. Confirm in the network
  panel.

**Build view (`/editor/{projectId}/build`):**
- A superseded row reads **`SHIPPED` · `BROWSER` · `replaced by change 1`** — all three badges,
  in that order, left to right.
- The badge is legible at 10px against the row's `bg-base` pill, at rest **and** under the
  header's `hover:bg-elevated`.
- Superseded rows sit in their **original position**, not reordered, not dimmed, not collapsed,
  not hidden.
- Expanding a superseded row shows the explanatory line and the "Not superseded" button;
  clearing it removes only the badge — status chip, verification chip, title, and number are
  unchanged.
- A **non**-superseded row shows no such badge and no such control.

**Cross-cutting:**
- Zero console errors on both routes across fresh loads.
- No failed network requests other than the deliberate 409s.
- The floating project sidebar, when open, does not render on top of either view's controls —
  the regression `pl-(--canvas-inset-left,0px)` exists to prevent.
- Keyboard: the clear control and the Apply control are reachable by Tab and activate on Enter;
  focus does not fall to `<body>` when a panel closes.

## Pass 2 — Unit 40's failure UI

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

## What to do with the result

1. Add a `### Follow-up — YYYY-MM-DD` to `context/progress/41-change-application.md` with what was
   observed, including any screenshot findings on badge crowding at four badges.
2. Add one to `context/progress/40-change-proposals.md` for pass 2, quoting the actual message the
   run published.
3. Update `context/progress-tracker.md`: unit 41 `partial → browser` if pass 1 is clean and the
   collaborator caveat is separately resolved; unit 40 drops its "failure UI never observed" line.
4. Delete this plan and its row in [`README.md`](README.md).

## If the badge row is crowded

Four badges plus a date on one line is the most this row has ever carried, and it is the likeliest
finding. **Do not fix it by dropping a badge** — the whole unit exists so all of them show at
once. The row already wraps (`flex flex-wrap`), so the fix, if one is needed, is spacing or
ordering, and it is a `designer` question rather than a patch to make in the moment.
