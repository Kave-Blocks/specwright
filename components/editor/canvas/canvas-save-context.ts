"use client"

import { createContext, useContext, type RefObject } from "react"

import type { CanvasSaveStatus } from "@/types/canvas"

/**
 * Bridges the canvas autosave across the Liveblocks room boundary. The save
 * status indicator lives in the navbar (outside the room), while the autosave
 * hook runs inside `CanvasFlow` (inside the room, where the collaborative
 * node/edge state exists). `EditorWorkspace` owns the state and provides this;
 * `CanvasFlow` reports status up through `setStatus` and registers its
 * immediate-save handler on `saveNowRef` so the navbar's Save button can flush.
 */
export interface CanvasSaveControls {
  /** Report the latest autosave status up to the navbar indicator. */
  setStatus: (status: CanvasSaveStatus) => void
  /** Slot where the canvas registers its "save now" handler for the navbar. */
  saveNowRef: RefObject<(() => void) | null>
}

const CanvasSaveContext = createContext<CanvasSaveControls | null>(null)

export const CanvasSaveProvider = CanvasSaveContext.Provider

export function useCanvasSave(): CanvasSaveControls {
  const controls = useContext(CanvasSaveContext)
  if (!controls) {
    throw new Error("useCanvasSave must be used within a CanvasSaveProvider")
  }
  return controls
}
