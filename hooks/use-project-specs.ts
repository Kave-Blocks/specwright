"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { ProjectSpecListResponse, ProjectSpecSummary } from "@/types/specs"

export interface UseProjectSpecsResult {
  /** The project's specs, newest first. Empty until the first load resolves. */
  specs: ProjectSpecSummary[]
  /** True while the list is being fetched (including a refresh). */
  isLoading: boolean
  /** Set when the list could not be loaded. */
  error: string | null
  /** Re-fetch the list — e.g. after a generation run finishes. */
  refresh: () => void
}

const LOAD_ERROR = "Couldn’t load your specs. Please try again."

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

        const { specs: loaded } =
          (await response.json()) as ProjectSpecListResponse

        if (requestRef.current !== requestId) return
        setSpecs(loaded ?? [])
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

  return useMemo(
    () => ({ specs, isLoading, error, refresh }),
    [specs, isLoading, error, refresh]
  )
}
