"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  BuildUnitListResponse,
  BuildUnitResponse,
  BuildUnitStatusValue,
  BuildUnitSummary,
  BuildUnitVerifiedValue,
} from "@/types/build-units"

/** A new unit, as the add form collects it. */
export interface BuildUnitDraft {
  title: string
  summary?: string
}

/**
 * The fields of a unit a person can change.
 *
 * Presence is meaningful and matches the route's `"field" in body` check: an
 * absent key leaves that column alone, while `summary: null` (or `""`) clears
 * it. `JSON.stringify` drops `undefined` values, so passing a patch straight
 * through preserves exactly that distinction.
 */
export interface BuildUnitPatch {
  title?: string
  summary?: string | null
  status?: BuildUnitStatusValue
  verified?: BuildUnitVerifiedValue
  /**
   * Clear supersession. `null` is the only value the type admits and the only
   * one the route accepts: setting it needs a change to point at, which a
   * person cannot invent, so removal is the whole of the human operation.
   */
  supersededByChange?: null
}

/**
 * What a mutation reports back.
 *
 * A failure travels *only* here — never into the hook's `error`, which is
 * reserved for list loads. That is what lets a refused rename surface a message
 * beside the input while the list it was refused against stays on screen.
 */
export type BuildUnitActionResult = { ok: true } | { ok: false; error: string }

export interface UseProjectBuildUnitsResult {
  /** The project's units in build order (sequence ascending). */
  units: BuildUnitSummary[]
  /** True while the list is being fetched (including a refresh). */
  isLoading: boolean
  /** Set when the *list* could not be loaded. Mutations never write here. */
  error: string | null
  /** Re-fetch the list. */
  refresh: () => void
  /** Add a unit; the created row is appended to local state. */
  create: (draft: BuildUnitDraft) => Promise<BuildUnitActionResult>
  /** Change a unit; the returned row replaces the local one by `id`. */
  update: (
    unitId: string,
    patch: BuildUnitPatch,
  ) => Promise<BuildUnitActionResult>
  /** Remove a unit; the local row is dropped by `id`. */
  remove: (unitId: string) => Promise<BuildUnitActionResult>
}

const LOAD_ERROR = "Couldn’t load your build units. Please try again."
const CREATE_ERROR = "Couldn’t add that unit. Please try again."
const UPDATE_ERROR = "Couldn’t save that change. Please try again."
const DELETE_ERROR = "Couldn’t delete that unit. Please try again."

/**
 * Read the actionable message off a failed response.
 *
 * The routes answer `{ error }` on every 400/404/409, and those strings are
 * written to be shown to a person ("A unit with that title already exists").
 * The guard's 401/404 and any unhandled 500 are not guaranteed to carry a JSON
 * body, hence the fallback — the same shape `share-dialog.tsx` uses.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Load and mutate a project's build units against
 * `/api/projects/{projectId}/build-units`.
 *
 * The load path is `useProjectSpecs`'s: plain `fetch` with an `AbortController`,
 * the request kept inside the effect so unmount and supersession share one
 * cleanup path, a reload key, and a request counter that discards a response a
 * newer request has already superseded. Like that hook it introduces no shared
 * or global state — the list is local to the Build tab.
 *
 * Mutations differ in two ways, both deliberate:
 *
 * - Each applies the row the server returned to local state instead of
 *   refetching the list. Refetching would put the list back into `isLoading`
 *   and blank it, so flipping one unit's status would flash the whole page.
 * - A mutation failure is returned, not stored. It never sets `error` and never
 *   touches `units`, so a 409 on a rename leaves the list exactly as it was.
 *
 * There is no per-action pending state here either: each caller awaits the
 * promise and owns its own `isSubmitting`, which keeps the add form's spinner
 * in the add form and off every other row.
 */
export function useProjectBuildUnits(
  projectId: string,
): UseProjectBuildUnitsResult {
  const [units, setUnits] = useState<BuildUnitSummary[]>([])
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
        const response = await fetch(
          `/api/projects/${projectId}/build-units`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error(`Build unit list failed (${response.status})`)
        }

        const { units: loaded } =
          (await response.json()) as BuildUnitListResponse

        if (requestRef.current !== requestId) return
        setUnits(loaded ?? [])
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

  const create = useCallback(
    async (draft: BuildUnitDraft): Promise<BuildUnitActionResult> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/build-units`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: draft.title,
              summary: draft.summary ?? null,
            }),
          },
        )
        if (!response.ok) {
          return {
            ok: false,
            error: await readErrorMessage(response, CREATE_ERROR),
          }
        }

        const { unit } = (await response.json()) as BuildUnitResponse
        // A new unit always takes the highest sequence, so appending keeps the
        // list in build order without a re-sort.
        setUnits((current) => [...current, unit])
        return { ok: true }
      } catch (createError) {
        console.error(createError)
        return { ok: false, error: CREATE_ERROR }
      }
    },
    [projectId],
  )

  const update = useCallback(
    async (
      unitId: string,
      patch: BuildUnitPatch,
    ): Promise<BuildUnitActionResult> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/build-units/${unitId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        )
        if (!response.ok) {
          return {
            ok: false,
            error: await readErrorMessage(response, UPDATE_ERROR),
          }
        }

        const { unit } = (await response.json()) as BuildUnitResponse
        // `sequence` is never edited, so replacing in place preserves order.
        setUnits((current) =>
          current.map((existing) => (existing.id === unit.id ? unit : existing)),
        )
        return { ok: true }
      } catch (updateError) {
        console.error(updateError)
        return { ok: false, error: UPDATE_ERROR }
      }
    },
    [projectId],
  )

  const remove = useCallback(
    async (unitId: string): Promise<BuildUnitActionResult> => {
      try {
        const response = await fetch(
          `/api/projects/${projectId}/build-units/${unitId}`,
          { method: "DELETE" },
        )
        if (!response.ok) {
          return {
            ok: false,
            error: await readErrorMessage(response, DELETE_ERROR),
          }
        }

        setUnits((current) => current.filter((unit) => unit.id !== unitId))
        return { ok: true }
      } catch (deleteError) {
        console.error(deleteError)
        return { ok: false, error: DELETE_ERROR }
      }
    },
    [projectId],
  )

  return useMemo(
    () => ({ units, isLoading, error, refresh, create, update, remove }),
    [units, isLoading, error, refresh, create, update, remove],
  )
}
