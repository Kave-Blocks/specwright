/**
 * Shared helpers for tracking a Trigger.dev run from the client.
 *
 * Both AI features subscribe to a run with `useRealtimeRun` and need the same
 * answer to the same question — "is it over?" — so the vocabulary lives here
 * rather than being restated per feature.
 */

/**
 * Run statuses that mean a task is over, successfully or not. Anything else
 * (queued, executing, reattempting, frozen, delayed) is still in flight.
 */
const FINISHED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "INTERRUPTED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
])

export function isFinishedRunStatus(status: string): boolean {
  return FINISHED_RUN_STATUSES.has(status)
}

/**
 * The run's latest status line, read off its metadata.
 *
 * Metadata crosses the network, so its shape is checked rather than trusted —
 * an unexpected shape falls back to the caller's generic line rather than
 * rendering `undefined`. Shared by every surface that tracks a task publishing
 * progress onto the **run** (spec generation, unit derivation) rather than onto
 * the room's `ai-status-feed`; the design agent and canvas write-back broadcast
 * instead and read nothing here.
 */
export function runMetadataText(metadata: unknown, fallback: string): string {
  if (typeof metadata !== "object" || metadata === null) return fallback
  const text = (metadata as { text?: unknown }).text
  return typeof text === "string" && text.length > 0 ? text : fallback
}

/**
 * The failure message the run published, or `null` when it published none worth
 * showing — in which case the caller falls back to its own constant.
 *
 * Only the `error` phase's text is taken: a run can fail after last publishing
 * a "processing…" line, and showing that as the error would read as though the
 * work were still going. Preferring this over a local constant is what keeps a
 * task's own wording ("this project has no spec", a spent AI quota) from being
 * replaced by "please try again", which is unit `37`'s regression.
 */
export function runMetadataFailureText(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null
  const record = metadata as { phase?: unknown; text?: unknown }
  if (record.phase !== "error") return null
  return typeof record.text === "string" && record.text.length > 0
    ? record.text
    : null
}
