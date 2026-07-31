"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  ChangeApplyResponse,
  ChangeListResponse,
  ChangeStaleRefusal,
  ChangeSummary,
} from "@/types/changes"

/**
 * A started proposal run, as the caller needs it to track progress.
 *
 * Both values come from routes that already exist: the run id from
 * `POST /api/ai/change`, and a read token scoped to just that run from
 * `POST /api/ai/spec/token`. The token route is **task-agnostic** — it verifies
 * a caller against the `TaskRun` record's `runId` and `userId` and never looks
 * at which task produced the run — so a change run reuses it as-is rather than
 * adding a second token endpoint.
 */
export interface ChangeRunHandle {
  runId: string
  token: string
}

/**
 * What a mutation reports back.
 *
 * A failure travels *only* here — never into the hook's `error`, which is
 * reserved for list loads. That is what lets the "this project has no spec yet"
 * refusal appear beside the request box while the list it was refused against
 * stays on screen, the same split `useProjectBuildUnits` documents.
 */
export type ChangeActionResult = { ok: true } | { ok: false; error: string }

/** What `propose` reports back — the same split, plus the started run. */
export type ProposeChangeResult =
  | { ok: true; run: ChangeRunHandle }
  | { ok: false; error: string }

/**
 * What `apply` reports back.
 *
 * A **stale** refusal is its own member rather than a message, because it is the
 * one refusal a person can resolve: it names the two versions and can be
 * re-submitted with the current one acknowledged. Every other refusal is
 * terminal, and collapsing the two into one error string would leave the view
 * unable to tell which it had. That is the "distinct, actionable state" the
 * unit spec asks for, expressed in the type rather than by parsing prose.
 */
export type ApplyChangeResult =
  | { ok: true; outcome: ChangeApplyResponse }
  | {
      ok: false
      kind: "stale"
      error: string
      stale: ChangeStaleRefusal["stale"]
    }
  | { ok: false; kind: "error"; error: string }

export interface UseProjectChangesResult {
  /** The project's changes, newest first. Empty until the first load resolves. */
  changes: ChangeSummary[]
  /** True while the list is being fetched (including a refresh). */
  isLoading: boolean
  /** Set when the *list* could not be loaded. Mutations never write here. */
  error: string | null
  /** Re-fetch the list — e.g. once a proposal run finishes. */
  refresh: () => void
  /**
   * Ask for a proposal. Starts a run and returns its handle; the change itself
   * does not exist until the run stores it, so nothing is added to the list
   * here — the caller refreshes when the run completes.
   */
  propose: (request: string) => Promise<ProposeChangeResult>
  /** Discard a change; the local row's status flips to `discarded`. */
  discard: (changeId: string) => Promise<ChangeActionResult>
  /**
   * Apply a change to the project's build list; the local row's status flips to
   * `applied`.
   *
   * `acknowledgedSpecVersion` is only ever the number a previous **stale**
   * refusal named — it confirms what the server said rather than instructing it,
   * and the server re-validates it against the project's real current version.
   */
  apply: (
    changeId: string,
    options?: { acknowledgedSpecVersion?: number },
  ) => Promise<ApplyChangeResult>
}

const LOAD_ERROR = "Couldn’t load your changes. Please try again."
const PROPOSE_ERROR = "Couldn’t start that change proposal. Please try again."
const DISCARD_ERROR = "Couldn’t discard that change. Please try again."
const APPLY_ERROR = "Couldn’t apply that change. Please try again."

/**
 * Read the actionable message off a failed response.
 *
 * The routes answer `{ error }` on every 400/404/409, and those strings are
 * written to be shown to a person — the 409 from `POST /api/ai/change` names
 * the action that resolves it ("Generate a spec first"), which a generic
 * fallback would throw away. The guard's 401/404 and any unhandled 500 are not
 * guaranteed to carry a JSON body, hence the fallback.
 */
async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Load and mutate a project's change proposals against
 * `/api/projects/{projectId}/changes`.
 *
 * The load path is `useProjectSpecs`'s: plain `fetch` with an
 * `AbortController`, the request kept inside the effect so unmount and
 * supersession share one cleanup path, a reload key, and a request counter that
 * discards a response a newer request has already superseded. Like that hook it
 * introduces no shared or global state — the list is local to the Changes tab.
 *
 * Only metadata is held here. A proposal document is fetched on demand by the
 * view when a change is expanded, through the change's own route, which is the
 * only way its bytes can be read.
 *
 * `propose` is deliberately *not* a list mutation: it starts a background run,
 * and the change row appears only once that run has stored it. So it returns
 * the run handle and leaves `changes` untouched, and the caller calls `refresh`
 * when the run reports complete. `discard` and `apply` are the opposite case —
 * the write has already happened by the time either resolves, so each applies
 * the new status locally rather than refetching, which would blank the list
 * mid-read.
 *
 * `apply` returns what landed (created units, superseded ids, skipped titles)
 * without holding any of it: the build list lives on another route with its own
 * hook, so there is no local list here for a created unit to join. The caller
 * reports the counts and the Build view reads the rows on its next load.
 */
export function useProjectChanges(projectId: string): UseProjectChangesResult {
  const [changes, setChanges] = useState<ChangeSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bumped to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0)

  // Ignore a stale response that resolves after a newer request has started.
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)

      try {
        const response = await fetch(`/api/projects/${projectId}/changes`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Change list failed (${response.status})`)
        }

        const { changes: loaded } =
          (await response.json()) as ChangeListResponse

        if (requestRef.current !== requestId) return
        setChanges(loaded ?? [])
        setError(null)
      } catch (loadError) {
        // A superseded request was aborted on purpose — not an error.
        if (controller.signal.aborted) return
        console.error(loadError)
        setError(LOAD_ERROR)
      } finally {
        if (requestRef.current === requestId) {
          setIsLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [projectId, reloadKey])

  const refresh = useCallback(() => setReloadKey((key) => key + 1), [])

  const propose = useCallback(
    async (request: string): Promise<ProposeChangeResult> => {
      try {
        // The room id *is* the project id, and it is all that is sent besides
        // the member's words: the spec, the brief, the canvas, and the unit
        // list are read server-side from the project the access check resolves.
        const response = await fetch("/api/ai/change", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId: projectId, request }),
        })
        if (!response.ok) {
          return {
            ok: false,
            error: await readErrorMessage(response, PROPOSE_ERROR),
          }
        }

        const { runId } = (await response.json()) as { runId?: string }
        if (!runId) {
          throw new Error("Change response is missing the run id")
        }

        // The trigger route returns only the run id; the token is minted by its
        // own route, scoped to this run.
        const tokenResponse = await fetch("/api/ai/spec/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        })
        if (!tokenResponse.ok) {
          throw new Error(`Change token failed (${tokenResponse.status})`)
        }

        const { token } = (await tokenResponse.json()) as { token?: string }
        if (!token) {
          throw new Error("Change token response is missing the token")
        }

        return { ok: true, run: { runId, token } }
      } catch (proposeError) {
        console.error(proposeError)
        return { ok: false, error: PROPOSE_ERROR }
      }
    },
    [projectId]
  )

  const discard = useCallback(
    async (changeId: string): Promise<ChangeActionResult> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/changes/${changeId}`,
          { method: "DELETE" }
        )
        if (!response.ok) {
          return {
            ok: false,
            error: await readErrorMessage(response, DISCARD_ERROR),
          }
        }

        // The row is kept, not removed — discarding is a status change, and a
        // rejected proposal is a decision worth still seeing.
        setChanges((current) =>
          current.map((change) =>
            change.id === changeId
              ? { ...change, status: "discarded" }
              : change
          )
        )
        return { ok: true }
      } catch (discardError) {
        console.error(discardError)
        return { ok: false, error: DISCARD_ERROR }
      }
    },
    [projectId]
  )

  const apply = useCallback(
    async (
      changeId: string,
      options: { acknowledgedSpecVersion?: number } = {}
    ): Promise<ApplyChangeResult> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/changes/${changeId}/apply`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Sent only when a stale refusal produced a number to confirm;
            // `JSON.stringify` drops the key when it is `undefined`, so an
            // ordinary apply carries an empty body.
            body: JSON.stringify({
              acknowledgedSpecVersion: options.acknowledgedSpecVersion,
            }),
          }
        )

        if (!response.ok) {
          // The stale refusal carries its own shape. Reading it off the body is
          // what lets the view offer a confirmation instead of a dead end, so
          // it is checked before falling back to the generic `{ error }` read.
          const refusal = await readStaleRefusal(response)
          if (refusal) {
            return {
              ok: false,
              kind: "stale",
              error: refusal.error,
              stale: refusal.stale,
            }
          }
          return {
            ok: false,
            kind: "error",
            error: await readErrorMessage(response, APPLY_ERROR),
          }
        }

        const outcome = (await response.json()) as ChangeApplyResponse

        // The row stays and its status moves — applying is a status change, and
        // the change that produced this work is exactly the record worth
        // keeping. Applied locally rather than by refetching, which would put
        // the list back into `isLoading` and blank it mid-read.
        setChanges((current) =>
          current.map((change) =>
            change.id === changeId ? { ...change, status: "applied" } : change
          )
        )
        return { ok: true, outcome }
      } catch (applyError) {
        console.error(applyError)
        return { ok: false, kind: "error", error: APPLY_ERROR }
      }
    },
    [projectId]
  )

  return useMemo(
    () => ({ changes, isLoading, error, refresh, propose, discard, apply }),
    [changes, isLoading, error, refresh, propose, discard, apply]
  )
}

/**
 * Read a stale-change refusal off a failed response, or `null` when the body is
 * not one.
 *
 * The body crosses the network, so its shape is checked rather than trusted —
 * both numbers have to actually be numbers, since the view renders them as the
 * versions to compare and passes one straight back as the acknowledgement.
 *
 * It reads a `clone()` rather than the response itself: a body can only be
 * consumed once, and on `null` the caller falls through to `readErrorMessage`,
 * which needs the stream still intact.
 */
async function readStaleRefusal(
  response: Response
): Promise<ChangeStaleRefusal | null> {
  let body: unknown
  try {
    body = await response.clone().json()
  } catch {
    return null
  }

  if (typeof body !== "object" || body === null) return null
  const record = body as { error?: unknown; stale?: unknown }
  if (typeof record.stale !== "object" || record.stale === null) return null

  const stale = record.stale as {
    baseSpecVersion?: unknown
    currentSpecVersion?: unknown
  }
  if (
    typeof stale.baseSpecVersion !== "number" ||
    typeof stale.currentSpecVersion !== "number"
  ) {
    return null
  }

  return {
    error: typeof record.error === "string" ? record.error : APPLY_ERROR,
    stale: {
      baseSpecVersion: stale.baseSpecVersion,
      currentSpecVersion: stale.currentSpecVersion,
    },
  }
}
