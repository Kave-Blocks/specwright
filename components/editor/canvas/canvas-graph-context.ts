"use client"

import { createContext, useContext, type RefObject } from "react"

import type { CanvasEdge, CanvasNode } from "@/types/canvas"

/** The canvas graph as the AI reads it — the same nodes and edges React Flow renders. */
export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export const EMPTY_CANVAS_GRAPH: CanvasGraph = { nodes: [], edges: [] }

/**
 * Bridges the live canvas graph across the Liveblocks room boundary, so the AI
 * sidebar's "Generate Spec" action can post the graph it is describing.
 *
 * The collaborative nodes and edges only exist inside `CanvasFlow` (via
 * `useLiveblocksFlow`), while the sidebar is a flex sibling of the canvas. This
 * mirrors `CanvasSaveProvider`'s `saveNowRef`: `EditorWorkspace` owns the slot,
 * `CanvasFlow` keeps it current, and the sidebar reads it.
 *
 * It is deliberately a **ref, not state** — the graph changes on every drag, and
 * pushing that through React state would re-render the whole workspace at frame
 * rate. Nothing renders from it; it is read once, at the moment the user clicks
 * Generate.
 */
export interface CanvasGraphControls {
  /** Slot the canvas keeps pointed at its current graph. */
  graphRef: RefObject<CanvasGraph>
}

const CanvasGraphContext = createContext<CanvasGraphControls | null>(null)

export const CanvasGraphProvider = CanvasGraphContext.Provider

export function useCanvasGraph(): CanvasGraphControls {
  const controls = useContext(CanvasGraphContext)
  if (!controls) {
    throw new Error("useCanvasGraph must be used within a CanvasGraphProvider")
  }
  return controls
}
