"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useStoreApi } from "@xyflow/react"

import { isEditableTarget } from "@/lib/editable-target"
import {
  DEFAULT_CANVAS_TOOL,
  type CanvasEdge,
  type CanvasNode,
  type CanvasTool,
} from "@/types/canvas"

/**
 * Single-key shortcuts, taken without a modifier. Cmd/Ctrl-chords are excluded
 * at the listener so `Cmd+V` still pastes rather than reaching for the select
 * tool. `Escape` is handled separately — it also cancels the in-flight gesture.
 */
const TOOL_SHORTCUTS: Record<string, CanvasTool> = {
  v: "select",
  h: "hand",
  r: "rectangle",
}

/** The tool space stands in for, for as long as the key is held. */
const HOLD_TOOL: CanvasTool = "hand"

export interface CanvasToolState {
  /** The one tool that is active right now — `hand` while space is held. */
  activeTool: CanvasTool
  /** Make `tool` the active tool, abandoning any gesture in progress. */
  selectTool: (tool: CanvasTool) => void
}

/**
 * Owns the canvas tool mode: which tool is active, what switching a tool does to
 * a gesture already under way, and the keyboard that drives both — the V / H / R
 * shortcuts, `Esc`, and hold-space.
 *
 * Exactly one tool is active at all times, starting at `select`. The active tool
 * owns the cursor (see the `data-canvas-tool` rules in `globals.css`) and decides
 * what a click and a drag on the canvas mean.
 *
 * **Hold-space** temporarily makes `hand` the active tool from anywhere, and
 * releasing it returns to the tool underneath — including a shape tool. It is a
 * real change of `activeTool`, not a special case bolted onto panning, so the
 * toolbar, the cursor, and every gesture gate follow from it for free: the tool
 * *is* `hand` while space is down. React Flow's own space-to-pan
 * (`panActivationKeyCode`, which defaults to `'Space'`) is turned off in `canvas.tsx`
 * so this is the only thing space does — see the note there.
 *
 * Takes the marquee's `cancelMarquee` so that `Esc` — and every other tool switch —
 * abandons a marquee mid-drag too, keeping `selectTool` the single point where an
 * in-flight gesture is cleared.
 *
 * Must be called inside a `ReactFlowProvider` — cancelling an in-progress
 * connector reaches into the React Flow store.
 */
export function useCanvasTool(cancelMarquee: () => void): CanvasToolState {
  const store = useStoreApi<CanvasNode, CanvasEdge>()
  const [activeTool, setActiveTool] = useState<CanvasTool>(DEFAULT_CANVAS_TOOL)

  // The tool to come back to when space is released — set exactly while a hold is
  // standing in for `hand`, null otherwise. A ref, not state: `activeTool` already
  // tells the toolbar and the cursor that `hand` is active, and nothing renders
  // from the tool sitting underneath it.
  const heldFrom = useRef<CanvasTool | null>(null)
  // Space came up mid-drag: the pan finishes first and the tool returns on release.
  const returnWhenIdle = useRef(false)
  // A pointer gesture is under way. Every gesture this hook has to stay out of the
  // way of — a marquee, a node move, a connector, a pan — is a primary-button drag,
  // so one flag covers all four without reaching into React Flow for three separate
  // in-progress states.
  const dragging = useRef(false)

  /** Come back to the tool space was pressed from. A no-op when space is not held. */
  const endHold = useCallback(() => {
    const from = heldFrom.current
    heldFrom.current = null
    returnWhenIdle.current = false
    if (from !== null) setActiveTool(from)
  }, [])

  const selectTool = useCallback(
    (tool: CanvasTool) => {
      // Choosing a tool outright ends any hold-space: the explicit choice is the one
      // that stands, and releasing space later must not undo it.
      heldFrom.current = null
      returnWhenIdle.current = false

      // Switching tools abandons whatever gesture the outgoing tool had started:
      // a connector dragged out of a node handle, or a marquee mid-drag (which
      // leaves the selection it started from intact). A shape placement is a
      // single click, so there is nothing there to abandon. This stays the one
      // place a gesture is cleared, rather than growing a second path.
      //
      // The *selection* is deliberately untouched: switching tools changes what
      // the next click means, not what is currently selected.
      store.getState().cancelConnection()
      cancelMarquee()
      setActiveTool(tool)
    },
    [cancelMarquee, store]
  )

  // Track the pointer, so space can tell "mid-gesture" from "idle".
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.isPrimary && event.button === 0) dragging.current = true
    }

    function handlePointerUp() {
      dragging.current = false
      if (returnWhenIdle.current) endHold()
    }

    // A native drag (a shape dragged off the tool panel) swallows the `pointerup`
    // entirely — without this the flag would stay stuck on and space would be
    // ignored for the rest of the session.
    function handleDragEnd() {
      handlePointerUp()
    }

    window.addEventListener("pointerdown", handlePointerDown, { capture: true })
    window.addEventListener("pointerup", handlePointerUp, { capture: true })
    window.addEventListener("pointercancel", handlePointerUp, { capture: true })
    window.addEventListener("dragend", handleDragEnd, { capture: true })
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true })
      window.removeEventListener("pointerup", handlePointerUp, { capture: true })
      window.removeEventListener("pointercancel", handlePointerUp, { capture: true })
      window.removeEventListener("dragend", handleDragEnd, { capture: true })
    }
  }, [endHold])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      // Leave chords to their owners (undo, redo, paste, browser shortcuts).
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.code === "Space") {
        // Swallow the browser's default whether or not the hold is taken: space
        // scrolls the page, and it re-fires a click on a toolbar button that still
        // holds focus from the click that activated the current tool.
        event.preventDefault()
        if (event.repeat || heldFrom.current !== null) return
        // Mid-gesture, space is ignored and the gesture completes as it would have.
        // This is load-bearing rather than merely polite: `hand` turns
        // `nodesConnectable` off, and React Flow only renders the connection line
        // while nodes are connectable — so taking the hold here would delete the
        // connector out from under the drag that is holding it.
        if (dragging.current) return

        heldFrom.current = activeTool
        setActiveTool(HOLD_TOOL)
        return
      }

      if (event.key === "Escape") {
        event.preventDefault()
        selectTool(DEFAULT_CANVAS_TOOL)
        return
      }

      const tool = TOOL_SHORTCUTS[event.key.toLowerCase()]
      if (!tool) return

      event.preventDefault()
      selectTool(tool)
    }

    function handleKeyUp(event: KeyboardEvent) {
      // No editable-target guard here on purpose: a hold is only ever taken from
      // outside a text field, so `heldFrom` being set already means space is ours.
      if (event.code !== "Space" || heldFrom.current === null) return

      // Released mid-pan: returning the tool now would flip the cursor and
      // `panOnDrag` under a drag already in flight, so the return waits for the
      // pointer — the mirror of space being ignored mid-gesture.
      if (dragging.current) {
        returnWhenIdle.current = true
        return
      }

      endHold()
    }

    // A window that loses focus (Cmd+Tab with space down) never delivers the
    // `keyup`, which would strand the canvas on the hand tool.
    function handleBlur() {
      dragging.current = false
      endHold()
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [activeTool, endHold, selectTool])

  return { activeTool, selectTool }
}
