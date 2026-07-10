"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { CanvasEdge, CanvasNode, CanvasSaveStatus } from "@/types/canvas"

/** How long canvas edits settle before a save fires, to avoid write spam. */
const AUTOSAVE_DELAY_MS = 1500

/** How long a terminal `saved`/`error` state shows before reverting to idle. */
const STATUS_RESET_MS = 2000

interface UseCanvasAutosaveInput {
  /** Project id — doubles as the canvas API path and the room id. */
  projectId: string
  /** Current canvas nodes (from the Liveblocks-backed flow). */
  nodes: CanvasNode[]
  /** Current canvas edges (from the Liveblocks-backed flow). */
  edges: CanvasEdge[]
  /**
   * Gate saving until the initial load check has completed, so loading saved
   * state (or the empty starting graph) never triggers a save on its own.
   */
  enabled: boolean
}

export interface UseCanvasAutosaveResult {
  /** Current save lifecycle, surfaced in the navbar indicator. */
  status: CanvasSaveStatus
  /** Force an immediate save, bypassing the debounce (manual Save / retry). */
  saveNow: () => void
}

/**
 * Debounced canvas autosave. Watches nodes/edges and, once `enabled`, PUTs the
 * latest graph to the canvas API after edits settle. Tracks `saving`/`saved`/
 * `error` and exposes `saveNow` for a manual save or an error retry.
 *
 * The graph is read through a ref inside the request so a save always sends the
 * freshest state without making the debounce effect depend on the request
 * function; an `AbortController` cancels any in-flight save superseded by a
 * newer one, so the last write wins.
 */
export function useCanvasAutosave({
  projectId,
  nodes,
  edges,
  enabled,
}: UseCanvasAutosaveInput): UseCanvasAutosaveResult {
  const [status, setStatus] = useState<CanvasSaveStatus>("idle")

  // Skip the first change after enabling: that first tick is the loaded (or
  // empty) baseline, not a user edit worth persisting.
  const skipNextChange = useRef(true)

  // Latest graph, read at request time so `save` never has to be recreated when
  // the graph changes (which would needlessly reset the debounce timer). Synced
  // in an effect (not during render) so a save — always fired asynchronously —
  // reads the committed state.
  const latestGraph = useRef({ nodes, edges })
  useEffect(() => {
    latestGraph.current = { nodes, edges }
  })

  const abortRef = useRef<AbortController | null>(null)

  const save = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStatus("saving")
    try {
      const response = await fetch(`/api/projects/${projectId}/canvas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latestGraph.current),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Canvas autosave failed (${response.status})`)
      }
      setStatus("saved")
    } catch (error) {
      // A superseded save was aborted on purpose — don't report it as an error.
      if (controller.signal.aborted) {
        return
      }
      console.error(error)
      setStatus("error")
    }
  }, [projectId])

  useEffect(() => {
    if (!enabled) {
      return
    }
    if (skipNextChange.current) {
      skipNextChange.current = false
      return
    }

    // Reflect the pending edit immediately, then persist once edits settle.
    setStatus("saving")
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [nodes, edges, enabled, save])

  // Show a terminal `saved`/`error` state briefly, then return to idle ("Save").
  // A new status (e.g. a fresh "saving") replaces `status` and cancels the reset.
  useEffect(() => {
    if (status !== "saved" && status !== "error") {
      return
    }
    const timer = setTimeout(() => setStatus("idle"), STATUS_RESET_MS)
    return () => clearTimeout(timer)
  }, [status])

  return { status, saveNow: save }
}
