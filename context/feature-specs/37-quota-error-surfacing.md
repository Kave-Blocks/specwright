When the OpenAI account behind Specwright has no quota left, tell the user that plainly instead of asking them to "try again" — and fail the run immediately rather than burning retry attempts on a call that cannot succeed.

## Implementation

1. `lib/ai-errors.ts` (new) — one shared predicate for "this model call failed permanently, not transiently."
   - Export `isQuotaExhaustedError(error: unknown): boolean`.
   - It must unwrap the AI SDK's `RetryError` (thrown by `generateText` after its own internal retries) and inspect the `APICallError`s inside its `errors` array, as well as an `APICallError` thrown directly. Use `APICallError.isInstance()` and `RetryError.isInstance()` from the installed SDK rather than `instanceof` or duck-typing — the task bundle and the app may hold separate copies of the class.
   - **A 429 alone must not be treated as quota exhaustion.** OpenAI returns 429 for an ordinary rate limit too, and that one *is* transient and *must* keep retrying. Key the decision on the error payload's `insufficient_quota` discriminator (`APICallError.data` is the provider's parsed `{ error: { message, type, code } }`), falling back to the raw `responseBody` when `data` is absent or an unexpected shape. Treat the check as case-insensitive substring matching on the `type`/`code` fields, matching how `@ai-sdk/openai` itself discriminates.
   - Return `false` for anything unrecognized. A wrong `false` costs the existing (correct) generic-error path; a wrong `true` would permanently fail a run that a retry would have saved, so bias to `false`.
   - Also export the single user-facing message both tasks publish, so the two cannot drift: it must say the AI account has run out of quota and that this is a Specwright-side billing limit, and must **not** tell the user to try again or suggest changing their canvas or prompt.

2. `trigger/generate-spec.ts` — make a spent quota terminal on the first attempt.
   - In the existing `catch`, ask `isQuotaExhaustedError` first. A quota failure is terminal **regardless of attempt number**, so it must satisfy the existing terminal condition that gates the `error` phase — the user sees the message on attempt 1, not after the full retry budget.
   - Publish the quota message from step 1 as the `error` phase's text, in place of the generic "hit an error … Please try again."
   - Rethrow it as `AbortTaskRunError` so Trigger fails the run immediately instead of retrying. Reuse the same non-retriable treatment the missing-`OPENAI_API_KEY` check directly above already applies — this is the same class of failure: no attempt will succeed until a human changes something outside the app.
   - Leave every other error on the existing path untouched: still gated by attempt number, still the generic message, still rethrown bare so Trigger retries.
   - Include a `quotaExhausted` field on the existing `logger.error` call so a run's logs say which branch was taken.

3. `trigger/design-agent.ts` — the same treatment, for the same reason.
   - Its `catch` announces to the shared `ai-status-feed` rather than to run metadata, and it announces on every attempt (it has no terminal gate). Keep that behavior; only change the **text** to the quota message when `isQuotaExhaustedError` matches, and rethrow as `AbortTaskRunError`.
   - Keep the announce best-effort — it must not be able to mask the original error — and keep clearing AI presence in `finally`.
   - No client change is needed for this path: `ai-status-feed.tsx` already renders the feed message's `text` verbatim, so the new wording reaches the canvas unchanged.

4. `components/editor/specs/specs-view.tsx` — stop overwriting the run's own failure message.
   - Today a failed run always shows the local `RUN_FAILED_ERROR` constant, so any message the task published is discarded. Prefer the run's published text when the run itself reported the failure, and fall back to `RUN_FAILED_ERROR` otherwise.
   - Only trust that text when the run's metadata reports the `error` phase. Metadata crosses the network, so validate its shape rather than trusting it — follow the existing `runStatusText` helper's approach in the same file.
   - When the *subscription* dropped rather than the run failing (the existing `runError` branch), keep the generic message: there is no trustworthy published text in that case.
   - This is deliberately general, not quota-specific — it is the mechanism by which any task-published failure message reaches the user.

## Dependencies

Already installed:

- `ai` (`RetryError`) and `@ai-sdk/provider` (`APICallError`), both already transitive dependencies of the `@ai-sdk/openai` provider this project uses.
- `@trigger.dev/sdk` (`AbortTaskRunError`), already imported by both tasks.

Nothing to install. No new env var.

## UI Details

- No new component, layout, or color. The quota message flows through two error surfaces that already exist and are already styled: the spec view's `role="alert"` line (`text-error` + `AlertCircle`) and the canvas status pill (`phase === "error"` → `text-error` + `AlertCircle`).
- Keep the message to one short sentence — both surfaces are single-line and the spec view's status line truncates.

## Scope Limits

- do not lower or remove the AI SDK's own internal retries inside `generateSpecMarkdown` / `generateDesignPlan`. `generateText` retries a 429 up to 3× before it ever throws, and the only lever available is a blanket `maxRetries`, which would also stop the legitimate retries that absorb real rate limits and 5xx. This unit removes the **task-level** retry waste (3 attempts → 1); the SDK-level 3 calls stay. Record the remainder rather than fixing it here.
- do not add a new member to `AiStatusPhase` in `types/tasks.ts`. `error` already exists and the distinction travels in the message text — a new phase would mean touching the feed validator, the status-pill icon/color mapping, and both producers for no user-visible gain.
- do not change `trigger.config.ts`'s retry settings. The fix is per-error classification, not a global retry policy change.
- do not add quota detection to any API route. Routes only trigger runs; the model call — and therefore the 429 — happens exclusively inside the tasks.
- do not touch `lib/spec-agent/generate.ts` or `lib/design-agent/plan.ts`. They throw; classification belongs to the callers that decide retry behavior.
- do not change the generic failure path's wording, gating, or retry behavior for any error other than an exhausted quota.
- do not add a preflight quota/balance check before triggering a run. There is no cheap way to ask OpenAI, and it would add a network round-trip to every generation to catch a rare state.

## Notes

- Read `context/architecture-context.md` (AI Generation Model) before implementing.
- `AbortTaskRunError` is the established pattern in both tasks for a non-retriable failure — the missing-`OPENAI_API_KEY` check in each is the reference. Follow it rather than introducing a new error class or a retry-count hack.
- The two tasks report failure through deliberately different channels and this unit must preserve that: `generate-spec` publishes to its **run's metadata** (a spec belongs to the requester), while `design-agent` announces to the shared **`ai-status-feed`** (it mutates the shared canvas, so everyone sees it). See `architecture-context.md` → Spec Generation.
- The originating incident and the full trace of today's behavior are recorded in `progress-tracker.md` → Open Questions ("A spent OpenAI quota is reported to the user as a transient failure").

## Check When Done

- A spec run that fails because the OpenAI quota is spent shows the user a message naming an account/quota limit, and that message does not ask them to try again.
- A design run that fails the same way shows the same message in the canvas status pill.
- Such a run fails after **one** task attempt — the run's own attempt count confirms no retry was made, and the error message appears without waiting out the retry backoff.
- An ordinary rate-limit 429 (`type` other than `insufficient_quota`) is still retried and still reports the generic failure message — quota detection has not swallowed the transient case.
- Any other failure (a bad payload, a missing `OPENAI_API_KEY`, a Blob or Prisma write error) behaves exactly as it did before this unit: same message, same attempt gating, same retries.
- A spec run whose realtime subscription drops mid-run still reports the generic failure message, not a stale published one.
- `isQuotaExhaustedError` returns `false` for `null`, `undefined`, a plain `Error`, and a non-429 `APICallError`.
- `npm run build` passes without type errors.
