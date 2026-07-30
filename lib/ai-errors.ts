import { APICallError } from "@ai-sdk/provider";
import { RetryError } from "ai";

/**
 * Classifying model-call failures that are **permanent**, so a task can stop
 * retrying something that cannot succeed.
 *
 * Only one such case is recognized today: the OpenAI account has no quota left.
 * That is not a transient fault — no number of retries fixes it, and the user
 * cannot fix it either. It needs to fail the run at once and say so honestly,
 * rather than spending the retry budget and then telling the user to try again.
 */

/**
 * The one message both AI tasks publish when the quota is spent. Shared so the
 * spec run's metadata and the design run's status feed cannot drift apart.
 *
 * It deliberately does **not** say "please try again": retrying is the one thing
 * that cannot work here. It also does not suggest editing the canvas or the
 * prompt — nothing about the user's input caused this, so hinting otherwise
 * would send them off to fix something that isn't broken.
 */
export const QUOTA_EXHAUSTED_MESSAGE =
  "Specwright's AI account has run out of quota, so this couldn't be generated. This is a billing limit on our side — nothing to fix on yours.";

/**
 * The discriminator OpenAI puts on a spent-quota error, in both `type` and
 * `code`. Matched case-insensitively as a substring, the same way
 * `@ai-sdk/openai` itself discriminates its error payloads.
 */
const QUOTA_DISCRIMINATOR = "insufficient_quota";

/**
 * Does this `APICallError` carry OpenAI's spent-quota discriminator?
 *
 * The status code alone is **not** enough to decide. OpenAI answers an ordinary
 * rate limit with 429 as well, and that one is genuinely transient — treating
 * every 429 as terminal would permanently fail runs that a retry would have
 * saved. So the provider's own `insufficient_quota` marker is what we key on.
 *
 * `data` is the provider's parsed error body (`{ error: { message, type, code } }`).
 * It can be absent or an unexpected shape when the response wasn't parseable, so
 * the raw `responseBody` is checked as a fallback.
 */
function isQuotaApiCallError(error: APICallError): boolean {
  const data = error.data;

  if (typeof data === "object" && data !== null) {
    const inner = (data as { error?: unknown }).error;
    if (typeof inner === "object" && inner !== null) {
      const { type, code } = inner as { type?: unknown; code?: unknown };
      const discriminator = [type, code]
        .filter((value) => typeof value === "string")
        .join(" ")
        .toLowerCase();
      if (discriminator.includes(QUOTA_DISCRIMINATOR)) {
        return true;
      }
    }
  }

  return (
    typeof error.responseBody === "string" &&
    error.responseBody.toLowerCase().includes(QUOTA_DISCRIMINATOR)
  );
}

/**
 * Whether a failure means the OpenAI account is out of quota — i.e. the run is
 * doomed and must not be retried.
 *
 * `generateText` runs its own internal retries first and then throws a
 * `RetryError` wrapping every attempt's error, so the wrapper is unwrapped and
 * each inner error inspected. A directly thrown `APICallError` is handled too.
 *
 * Uses the SDK's `isInstance` statics rather than `instanceof`: the Trigger task
 * bundle and the Next app can each hold their own copy of these classes, and
 * `instanceof` would silently fail across that boundary.
 *
 * Unrecognized input returns `false`. The asymmetry is deliberate — a wrong
 * `false` merely falls back to the existing generic retry path, whereas a wrong
 * `true` would permanently fail a run that a retry would have rescued.
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  if (APICallError.isInstance(error)) {
    return isQuotaApiCallError(error);
  }

  if (RetryError.isInstance(error)) {
    return error.errors.some(
      (inner) => APICallError.isInstance(inner) && isQuotaApiCallError(inner),
    );
  }

  return false;
}
