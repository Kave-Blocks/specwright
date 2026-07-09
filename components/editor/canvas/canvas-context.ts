"use client"

import { createContext, useContext } from "react"

/**
 * Element-level actions a custom node or edge renderer can call to mutate the
 * shared canvas. Provided by `CanvasFlow` (which owns the Liveblocks-backed
 * `onNodesChange`/`onEdgesChange`) so edits made inside a node or edge still
 * flow through the collaborative state instead of React Flow's local-only store.
 */
export interface CanvasActions {
  /** Commit a node's label through the synced node-change flow. */
  updateNodeLabel: (id: string, label: string) => void
  /** Commit a node's background/text color pair through the synced flow. */
  updateNodeColor: (id: string, color: string, textColor: string) => void
  /** Commit an edge's inline label through the synced edge-change flow. */
  updateEdgeLabel: (id: string, label: string) => void
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

export const CanvasActionsProvider = CanvasActionsContext.Provider

export function useCanvasActions(): CanvasActions {
  const actions = useContext(CanvasActionsContext)
  if (!actions) {
    throw new Error("useCanvasActions must be used within a CanvasActionsProvider")
  }
  return actions
}
