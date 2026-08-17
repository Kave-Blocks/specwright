"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ProjectSpecListResponse, ProjectSpecSummary } from "@/types/specs"

export interface UseProjectSpecsResult {
  /** The project's specs, newest first. Empty until the first load resolves. */
  specs: ProjectSpecSummary[]
  /**
   * Applied changes the current spec does not describe — `0` when it is up to
   * date, and `0` while the first load is still in flight.
   *
   * Refreshed by the same reload the hook already performs after a generation
   * finishes, so generating a spec clears the drift with no second mechanism.
   */
  appliedSinceCurrentSpec: number
  /**
   * How many of those have not reached the canvas yet — which of the two the
   * drift notice may say, since a spec is written from the canvas.
   */
  unpushedSinceCurrentSpec: number
  /** The version the count is measured against, or `null` with no specs. */
  currentSpecVersion: number | null
  /** True while the list is being fetched (including a refresh). */
  isLoading: boolean
  /** Set when the list could not be loaded. */
  error: string | null
  /** Re-fetch the list — e.g. after a generation run finishes. */
  refresh: () => void
}

const LOAD_ERROR = "Couldn’t load your specs. Please try again."

/** The drift half of the response, held together so the two never disagree. */
type SpecDriftState = Pick<
  UseProjectSpecsResult,
  | "appliedSinceCurrentSpec"
  | "unpushedSinceCurrentSpec"
  | "currentSpecVersion"
>

/**
 * What drift reads as before the first response, and after a failed one: no
 * drift. A notice inferred from an unloaded list would claim the spec is behind
 * on every mount, before anything is known.
 */
const NO_DRIFT: SpecDriftState = {
  appliedSinceCurrentSpec: 0,
  unpushedSinceCurrentSpec: 0,
  currentSpecVersion: null,
}

/**
 * Load a project's spec metadata from `GET /api/projects/{projectId}/specs`.
 *
 * Plain `fetch` + `AbortController`, matching `useCanvasAutosave` — the list is
 * local to the Specs tab, so it deliberately introduces no shared/global state.
 * Only metadata is held here; the Markdown itself is fetched on demand by the
 * preview and dropped when the modal closes.
 */
export function useProjectSpecs(projectId: string): UseProjectSpecsResult {
  const [specs, setSpecs] = useState<ProjectSpecSummary[]>([])
  // Held beside the list, not derived from it: drift is a fact about changes,
  // and nothing in the spec metadata can say how many changes came after.
  const [drift, setDrift] = useState<SpecDriftState>(NO_DRIFT)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bumped to re-run the fetch effect. Keeping the request *in* the effect (
  // rather than in a callback the effect calls) means unmount and supersession
  // are handled by the one cleanup path.
  const [reloadKey, setReloadKey] = useState(0)

  // Ignore a stale response that resolves after a newer request has started.
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current
    const controller = new AbortController()

    async function load() {
      setIsLoading(true)

      try {
        const response = await fetch(`/api/projects/${projectId}/specs`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Spec list failed (${response.status})`)
        }

        const {
          specs: loaded,
          appliedSinceCurrentSpec,
          unpushedSinceCurrentSpec,
          currentSpecVersion,
        } = (await response.json()) as ProjectSpecListResponse

        if (requestRef.current !== requestId) return
        setSpecs(loaded ?? [])
        // Defaulted rather than trusted: the three fields cross the network, and
        // a response that predates them would otherwise render `undefined`
        // changes since version `undefined`. `unpushedSinceCurrentSpec` defaults
        // to **zero pushed**, i.e. all of them unpushed, so a response that has
        // not heard of `43` yet gets the cautious notice rather than the one
        // that says regenerating is safe.
        setDrift({
          appliedSinceCurrentSpec: appliedSinceCurrentSpec ?? 0,
          unpushedSinceCurrentSpec:
            unpushedSinceCurrentSpec ?? appliedSinceCurrentSpec ?? 0,
          currentSpecVersion: currentSpecVersion ?? null,
        })
        setError(null)
      } catch (loadError) {
        // A superseded request was aborted on purpose — not an error.
        if (controller.signal.aborted) return
        console.error(loadError)
        // A failed load knows nothing about drift, so it must not keep
        // asserting the last count it saw.
        setDrift(NO_DRIFT)
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

  return useMemo(
    () => ({ specs, ...drift, isLoading, error, refresh }),
    [specs, drift, isLoading, error, refresh]
  )
}
