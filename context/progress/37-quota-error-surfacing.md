# 37 — Quota Error Surfacing

A spent OpenAI quota is now recognised as a **permanent** failure: the run fails on its first
attempt instead of burning the retry budget, and the user is told it is a billing limit on
Specwright's side rather than being asked to "try again" — the one action that cannot work.

Found while verifying unit `36`, when the account's quota ran out mid-verification. Fixed against
a **live reproduction**, which is what makes the classification here trustworthy rather than
guessed.

## What Was Wrong

Traced through the code before writing the spec. On a quota 429, both AI paths did this:

1. The AI SDK's `generateText` retried internally **3×**, then threw a `RetryError`.
2. `generate-spec`'s catch treated it as ordinary. `isTerminalFailure` is false on attempts 1–2 of
   3, so **no `error` phase was published at all** and the error was rethrown — Trigger then
   retried the whole task (`trigger.config.ts` → `maxAttempts: 3`). Up to **9 doomed model calls
   for one click.**
3. Only on the final attempt did it publish the catch-all `"Specwright hit an error and couldn't
   finish the spec. Please try again."`
4. The client then discarded even that, substituting its own `RUN_FAILED_ERROR` — same
   "Please try again."

So the user waited through three rounds of retry backoff to be told to repeat an action guaranteed
to fail until someone topped up billing.

## What Shipped

### `lib/ai-errors.ts` (new) — the classification, in one place

`isQuotaExhaustedError(error: unknown): boolean`, plus `QUOTA_EXHAUSTED_MESSAGE` — the single
user-facing string both tasks publish, shared so the run-metadata copy and the status-feed copy
cannot drift.

The one design decision that carries real weight: **a 429 is not sufficient evidence.** OpenAI
answers an ordinary rate limit with 429 too, and that one *is* transient and *must* keep retrying.
Treating every 429 as terminal would permanently fail runs that a retry would have saved — turning
a bug that wastes attempts into a bug that loses work. So the check keys on the provider's own
`insufficient_quota` discriminator in `APICallError.data.error.{type,code}`, falling back to the
raw `responseBody` when the body wasn't parseable.

Two smaller choices worth recording:

- **`APICallError.isInstance()` / `RetryError.isInstance()`, not `instanceof`.** The Trigger task
  bundle and the Next app can each hold their own copy of these classes; `instanceof` fails
  silently across that boundary, and a silently-false classification here would look exactly like
  the bug being fixed.
- **Unrecognised input returns `false`.** The asymmetry is deliberate: a wrong `false` merely
  falls back to the existing generic retry path, whereas a wrong `true` permanently fails a
  recoverable run.

### `trigger/generate-spec.ts` and `trigger/design-agent.ts` — terminal on the first attempt

Both catches now ask `isQuotaExhaustedError` first. When it matches, the quota message is
published instead of the generic line, and the error is rethrown as `AbortTaskRunError` so Trigger
fails the run immediately. That reuses the exact non-retriable treatment the missing-`OPENAI_API_KEY`
check in each task already applies — the same class of failure: nothing succeeds until a human acts
outside the app.

In `generate-spec`, `terminal` is now `quotaExhausted || isTerminalFailure(...)`, so the phase
publishes on attempt 1 rather than waiting out the budget. Every other error keeps its existing
behaviour exactly: same gating, same generic message, same bare rethrow, same retries. Both tasks
gained a `quotaExhausted` field on their `logger.error` call so a run's logs say which branch ran.

The two tasks keep reporting through their deliberately different channels — `generate-spec` to its
**run metadata** (a spec belongs to its requester), `design-agent` to the shared **`ai-status-feed`**
(it mutates the shared canvas). `design-agent` also keeps announcing on every attempt and keeps
clearing AI presence in `finally`.

### `components/editor/specs/specs-view.tsx` — stop discarding the run's own message

A failed run previously always showed the local `RUN_FAILED_ERROR`, so any message the task
published was thrown away. `settle` now takes a `failureText` and prefers it.

Two guards on trusting that text, both mattering:

- Only the **`error` phase's** text is taken (new `runFailureText` helper). A run can fail after
  last publishing a `"processing…"` line, and showing that as the error would read as though the
  spec were still being written.
- When the **subscription dropped** (`runError`) rather than the run failing, the generic message
  stands — cached metadata predates the drop, so there is nothing trustworthy to show.

Metadata crosses the network, so its shape is validated rather than trusted, following the
existing `runStatusText` helper in the same file.

This change is deliberately **general, not quota-specific**: it is the mechanism by which any
task-published failure message reaches the user. Quota is simply its first caller.

## Deviations From The Spec

None. The scope limits held — no new `AiStatusPhase` member, no `trigger.config.ts` change, no
route-level detection, no preflight balance check, and `lib/spec-agent/generate.ts` /
`lib/design-agent/plan.ts` were not touched (they throw; classification belongs to the callers
that decide retry behaviour).

## Verified

`npm run build` passes with no type errors. `npm run lint` is clean.

`isQuotaExhaustedError` was then exercised from a temporary script (since removed) — **9 assertions,
all passing**, and one of them against the real thing:

| Input | Expected | Result |
| --- | --- | --- |
| `null`, `undefined`, plain `Error`, a bare string | `false` | pass |
| `APICallError` with status 500 | `false` | pass |
| 429 `rate_limit_exceeded` | `false` — must stay retriable | pass |
| 429 `insufficient_quota` via `data` | `true` | pass |
| 429 `insufficient_quota` via `responseBody` only | `true` | pass |
| **A live `generateSpecMarkdown` call against the exhausted account** | `true` | pass |

The live case is the valuable one. It threw exactly what production throws — a `RetryError`
wrapping the `APICallError` ("Failed after 3 attempts… You exceeded your current quota") — and the
predicate unwrapped and classified it correctly. The detection is confirmed against a real payload,
not a fabricated one.

`QUOTA_EXHAUSTED_MESSAGE` was also asserted not to match `/try again/i`.

**Re-verified 2026-07-30** on the committed code, from a fresh throwaway script (also since removed) —
**19 assertions, all passing**, extending the original set with the cases the first pass left implicit:
a `RetryError` wrapping only rate limits (stays retriable), a `RetryError` mixing one quota error in
among rate limits (terminal), a `RetryError` wrapping plain `Error`s (`false`), an `APICallError` whose
`data` is a non-object so the `responseBody` fallback has to carry the decision, an `UPPERCASE`
discriminator, and a bare `"insufficient_quota"` string (`false` — the substring must not be enough on
its own). `npm run build` and `npm run lint` both clean at that commit.

### Not verified

**That Trigger actually makes only one attempt.** `AbortTaskRunError` is documented and
already-used-here behaviour, and the code path is confirmed reachable, but the attempt count was
not observed — it needs a Trigger worker, and `trigger.config.ts` sets `retries.enabledInDev: false`,
so a dev run is a single attempt regardless and could not distinguish the fix from the bug. Confirming
this requires a deployed run against a spent quota.

**The rendered message in either UI surface.** Neither the spec view's alert line nor the canvas
status pill was driven in a browser. Both render an existing, already-styled string — no new
component or state — so the risk is wording and truncation rather than correctness.

## Left Undone

**The AI SDK's own 3 internal retries remain**, per the spec's scope limit. `generateText` retries
the 429 three times before it ever throws, and the only lever is a blanket `maxRetries`, which
would also disable the legitimate retries that absorb real rate limits and 5xx. So this unit takes
the waste from **up to 9 doomed model calls down to 3** — the task-level multiplier is gone, the
SDK-level one is not. Revisit only if the AI SDK gains a per-error retry predicate.

Unit `36`'s four outstanding content-level checks are still outstanding — they need quota to run,
which is the condition this unit exists to report gracefully, not to remove.
