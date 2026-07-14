"use client"

import { useEffect } from "react"
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react"

import { isEditableTarget } from "@/lib/editable-target"

/**
 * Duration (ms) of the zoom/fit-view animation. Shared between the keyboard
 * shortcuts here and the on-screen control bar so both feel identically smooth.
 */
export const ZOOM_DURATION = 200

interface UseKeyboardShortcutsOptions<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
> {
  /** The React Flow instance, used to drive the zoom shortcuts. */
  reactFlow: ReactFlowInstance<NodeType, EdgeType>
  /** Called for the undo shortcut. */
  onUndo: () => void
  /** Called for the redo shortcut. */
  onRedo: () => void
}

/**
 * Wires the canvas keyboard shortcuts to the React Flow instance (zoom) and the
 * supplied undo/redo handlers (history), listening on `window`:
 *
 * - `+` / `=` — zoom in
 * - `-` — zoom out
 * - `Cmd/Ctrl + Z` — undo
 * - `Cmd/Ctrl + Shift + Z` — redo
 * - `Cmd/Ctrl + Y` — redo
 *
 * Shortcuts are ignored while the user is typing in an editable field.
 */
export function useKeyboardShortcuts<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge,
>({
  reactFlow,
  onUndo,
  onRedo,
}: UseKeyboardShortcutsOptions<NodeType, EdgeType>): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return

      // History shortcuts are Cmd/Ctrl-based.
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase()
        if (key === "z") {
          event.preventDefault()
          if (event.shiftKey) onRedo()
          else onUndo()
        } else if (key === "y") {
          event.preventDefault()
          onRedo()
        }
        return
      }

      // Zoom shortcuts take no modifier.
      switch (event.key) {
        case "+":
        case "=":
          event.preventDefault()
          void reactFlow.zoomIn({ duration: ZOOM_DURATION })
          break
        case "-":
          event.preventDefault()
          void reactFlow.zoomOut({ duration: ZOOM_DURATION })
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [reactFlow, onUndo, onRedo])
}
