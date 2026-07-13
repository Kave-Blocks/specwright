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
