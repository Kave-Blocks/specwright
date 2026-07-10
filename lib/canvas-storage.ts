import type { CanvasSnapshot } from "@/types/canvas"

/**
 * Object path for a project's canvas snapshot in Vercel Blob. Deterministic so
 * every save overwrites the same object (see `architecture-context.md` →
 * Storage Model: `canvas/{projectId}.json`), keeping the stored blob URL stable.
 */
export function canvasBlobPath(projectId: string): string {
  return `canvas/${projectId}.json`
}

/**
 * Validate an unknown payload as a canvas snapshot at the API boundary. Both the
 * PUT request body and the JSON fetched back from Blob pass through here, so a
 * malformed or partial payload collapses to `null` rather than being trusted.
 * Node/edge shape validation is left to React Flow / Liveblocks — this only
 * guarantees the top-level `{ nodes, edges }` array contract.
 */
export function parseCanvasSnapshot(value: unknown): CanvasSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null
  }

  const { nodes, edges } = value as Record<string, unknown>
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return null
  }

  return {
    nodes: nodes as CanvasSnapshot["nodes"],
    edges: edges as CanvasSnapshot["edges"],
  }
}
