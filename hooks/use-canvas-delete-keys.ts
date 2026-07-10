"use client"

import { useEffect, useRef } from "react"
import { useEdges, useNodes, type OnDelete } from "@xyflow/react"

import type { CanvasEdge, CanvasNode } from "@/types/canvas"

/**
 * True when a key event originates from a field the user is typing into (input,
 * textarea, select, or any contentEditable element), so a node/edge delete never
 * fires while editing a label.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

/**
 * Deletes the currently selected nodes and edges on Delete / Backspace, routing
 * the removal through the supplied Liveblocks-backed `onDelete` so it syncs to
 * every connected client in real time. React Flow's own keyboard deletion is
 * disabled at the call site (`deleteKeyCode={null}`), making this the single
 * deletion path — all deletions go through the collaborative state.
 *
 * Selection is read from React Flow's store via `useNodes`/`useEdges`; the latest
 * values are held in a ref so the `window` listener is bound only once rather
 * than re-attached on every node/edge change.
 */
export function useCanvasDeleteKeys(
  onDelete: OnDelete<CanvasNode, CanvasEdge>
): void {
  const nodes = useNodes<CanvasNode>()
  const edges = useEdges<CanvasEdge>()

  const latest = useRef({ nodes, edges, onDelete })
  useEffect(() => {
    latest.current = { nodes, edges, onDelete }
  })

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      if (isEditableTarget(event.target)) return

      const { nodes, edges, onDelete } = latest.current
      const selectedNodes = nodes.filter((node) => node.selected)
      const selectedEdges = edges.filter((edge) => edge.selected)
      if (selectedNodes.length === 0 && selectedEdges.length === 0) return

      // Also remove edges attached to any deleted node (matching React Flow's own
      // deletion) so no edge is left dangling from a node that no longer exists.
      const deletedNodeIds = new Set(selectedNodes.map((node) => node.id))
      const edgesToDelete = edges.filter(
        (edge) =>
          edge.selected ||
          deletedNodeIds.has(edge.source) ||
          deletedNodeIds.has(edge.target)
      )

      event.preventDefault()
      onDelete({ nodes: selectedNodes, edges: edgesToDelete })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
