import type { Connection } from "@xyflow/react"

import {
  CANVAS_EDGE_TYPE,
  DEFAULT_EDGE_OPTIONS,
  type CanvasEdge,
} from "@/types/canvas"

/** Monotonic counter so edges created within the same millisecond stay unique. */
let edgeCounter = 0

/** Build a unique edge id from a timestamp and a counter. */
export function generateEdgeId(): string {
  edgeCounter += 1
  return `edge-${Date.now()}-${edgeCounter}`
}

/**
 * Build a canvas edge from a React Flow connection, applying the default edge
 * options (custom edge type, arrowhead marker, light stroke). Used by `onConnect`
 * so a freshly drawn connection renders through the custom canvas edge renderer
 * and syncs through Liveblocks Storage. Starts with an empty label.
 */
export function createCanvasEdge(connection: Connection): CanvasEdge {
  return {
    ...DEFAULT_EDGE_OPTIONS,
    id: generateEdgeId(),
    type: CANVAS_EDGE_TYPE,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    data: { label: "" },
  }
}
