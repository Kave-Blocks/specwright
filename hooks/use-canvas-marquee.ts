"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  useReactFlow,
  useStoreApi,
  type EdgeChange,
  type NodeChange,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react"

import type { CanvasEdge, CanvasNode } from "@/types/canvas"

/**
 * How far (in screen pixels) the pointer must travel from the press before the
 * drag becomes a marquee. Below it the gesture stays a click, so a slightly shaky
 * press on empty canvas clears the selection instead of leaving a stray rectangle
 * behind and selecting nothing.
 */
const MARQUEE_THRESHOLD = 4

/** React Flow's class for the empty canvas surface — the only place a marquee starts. */
const PANE_CLASS = "react-flow__pane"

/** An axis-aligned rectangle; `x`/`y` is the top-left corner. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The selection a marquee began from: restored on cancel, added to when it is additive. */
interface Selection {
  nodes: Set<string>
  edges: Set<string>
}

/** A marquee in flight. */
interface Gesture {
  /**
   * The pointer that started it. The window listeners below are bound for *this*
   * pointer alone: a device can have several in play at once (a second finger, a
   * stylus alongside a touch), and every one of them fires `pointermove` and
   * `pointerup` at the same window.
   */
  pointerId: number
  /** The press point, in client coordinates. */
  originX: number
  originY: number
  /** The canvas wrapper's box at the press, so client points can be drawn in its space. */
  bounds: DOMRect
  /** What was selected at the press. */
  from: Selection
  /** Shift was held at the press: the marquee adds to `from` instead of replacing it. */
  additive: boolean
  /** The drag has passed `MARQUEE_THRESHOLD` — it is a marquee now, not a click. */
  active: boolean
}

export interface CanvasMarquee {
  /**
   * The rectangle being dragged right now, in the canvas wrapper's pixel space.
   * `null` whenever no marquee is on screen.
   */
  rect: Rect | null
  /**
   * Put on the canvas wrapper *only while `select` is active* — this is what arms a
   * marquee, so leaving it off is how another tool declines the gesture entirely.
   */
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void
  /**
   * Put on the canvas wrapper unconditionally: it swallows the click a finished or
   * cancelled marquee leaves behind, which must happen even if the tool changed
   * mid-drag and took `onPointerDownCapture` with it.
   */
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  /** Abandon a marquee in flight, leaving the selection it started from intact. */
  cancelMarquee: () => void
}

/**
 * Marquee selection: dragging from empty canvas draws a rectangle, every shape it
 * touches highlights as it grows, and releasing selects them. Holding shift adds
 * the result to the existing selection instead of replacing it.
 *
 * The rectangle and the hit-testing are ours rather than React Flow's own
 * `selectionOnDrag`. React Flow's marquee cannot be made additive or cancellable:
 * it clears the selection the moment the drag crosses its threshold, and it writes
 * `selected` **straight into its internal node lookup** (`getSelectionChanges`,
 * which its own source calls "this hack") — the lookup React Flow renders from. A
 * change dropped or re-added on the way to Liveblocks would not reliably undo that
 * write, because Liveblocks' storage snapshots are structurally shared: a node we
 * leave alone keeps its object identity, and React Flow then *reuses* the mutated
 * internal node instead of rebuilding it from ours. So selection here travels the
 * one path that is already proven — `select` changes through the Liveblocks-backed
 * handlers, exactly what a click on a node emits.
 *
 * Must be called inside a `ReactFlowProvider`.
 */
export function useCanvasMarquee(
  onNodesChange: OnNodesChange<CanvasNode>,
  onEdgesChange: OnEdgesChange<CanvasEdge>
): CanvasMarquee {
  const store = useStoreApi<CanvasNode, CanvasEdge>()
  const { screenToFlowPosition } = useReactFlow<CanvasNode, CanvasEdge>()

  const [rect, setRect] = useState<Rect | null>(null)

  // The gesture in flight. A ref, not state: it updates on every pointer move, and
  // the only thing rendered from it is `rect`.
  const gesture = useRef<Gesture | null>(null)
  // Detaches the window listeners bound for the gesture in flight.
  const detach = useRef<(() => void) | null>(null)
  // A marquee ends in a `click` on the pane, which React Flow answers by clearing the
  // selection — undoing the very thing the marquee just did. Armed while a marquee is
  // real, and spent by the click that follows its release.
  const swallowClick = useRef(false)

  // Latest handlers, read from the window listeners so they are bound once per gesture
  // rather than re-bound whenever the graph changes.
  const latest = useRef({ onNodesChange, onEdgesChange, screenToFlowPosition })
  useEffect(() => {
    latest.current = { onNodesChange, onEdgesChange, screenToFlowPosition }
  })

  /**
   * Make `selection` the selection, exactly — every id in it selected, everything else
   * not. Selection travels as `select` changes through the Liveblocks-backed handlers,
   * the same path a click on a node takes, which keeps it local to this user (`selected`
   * is local-only in Liveblocks' node config) and leaves React Flow's store to reconcile
   * from the graph rather than being written behind its back.
   */
  const applySelection = useCallback(
    (selection: Selection) => {
      const { nodes, edges } = store.getState()

      const nodeChanges: NodeChange<CanvasNode>[] = []
      for (const node of nodes) {
        const selected = selection.nodes.has(node.id)
        if ((node.selected ?? false) !== selected) {
          nodeChanges.push({ id: node.id, type: "select", selected })
        }
      }

      const edgeChanges: EdgeChange<CanvasEdge>[] = []
      for (const edge of edges) {
        const selected = selection.edges.has(edge.id)
        if ((edge.selected ?? false) !== selected) {
          edgeChanges.push({ id: edge.id, type: "select", selected })
        }
      }

      if (nodeChanges.length > 0) latest.current.onNodesChange(nodeChanges)
      if (edgeChanges.length > 0) latest.current.onEdgesChange(edgeChanges)
    },
    [store]
  )

  const endGesture = useCallback(() => {
    detach.current?.()
    detach.current = null
    gesture.current = null
    setRect(null)
  }, [])

  const handleMove = useCallback(
    (current: Gesture, event: PointerEvent) => {
      // Only the pointer that started the marquee may move it. A second finger's
      // moves would otherwise be read as this one's, snapping the rectangle across
      // the canvas and selecting whatever it swept.
      if (event.pointerId !== current.pointerId) return

      const dx = event.clientX - current.originX
      const dy = event.clientY - current.originY

      if (!current.active) {
        if (Math.hypot(dx, dy) <= MARQUEE_THRESHOLD) return
        current.active = true
        swallowClick.current = true
      }

      setRect({
        x: Math.min(current.originX, event.clientX) - current.bounds.left,
        y: Math.min(current.originY, event.clientY) - current.bounds.top,
        width: Math.abs(dx),
        height: Math.abs(dy),
      })

      // Hit-test in flow coordinates, so the marquee tracks the shapes rather than the
      // screen — both corners are converted, which keeps it correct at any pan or zoom.
      const { screenToFlowPosition } = latest.current
      const start = screenToFlowPosition({ x: current.originX, y: current.originY })
      const end = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const area: Rect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      }

      const hits = new Set(
        store
          .getState()
          .nodes.filter((node) => intersects(node, area))
          .map((node) => node.id)
      )

      // Shift adds the marquee's result to what was already selected — which is also why
      // a plain marquee is the thing that clears a selected edge: it replaces, so an edge
      // it cannot touch is dropped, while an additive one leaves it be. The marquee itself
      // only ever selects shapes.
      applySelection(
        current.additive
          ? {
              nodes: new Set([...current.from.nodes, ...hits]),
              edges: current.from.edges,
            }
          : { nodes: hits, edges: new Set() }
      )
    },
    [applySelection, store]
  )

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target
      // A marquee starts on the empty canvas and nowhere else. A press on a node, on a
      // connection handle, or on a floating toolbar belongs to somebody else's gesture —
      // which is exactly what keeps a connector drag off a shape edge from marqueeing.
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        !(target instanceof Element) ||
        !target.classList.contains(PANE_CLASS)
      ) {
        return
      }

      const { nodes, edges } = store.getState()
      const current: Gesture = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        bounds: event.currentTarget.getBoundingClientRect(),
        from: {
          nodes: new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
          edges: new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id)),
        },
        additive: event.shiftKey,
        active: false,
      }
      gesture.current = current

      // Bound on `window`, not on the wrapper, so the drag survives the pointer leaving
      // the canvas — and so a tool switch mid-drag, which unmounts these very props,
      // still sees its `pointerup`. Both listeners answer to `current.pointerId` alone:
      // a foreign pointer's release must not end a drag that is still under way.
      const onMove = (move: PointerEvent) => handleMove(current, move)
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== current.pointerId) return
        endGesture()
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.addEventListener("pointercancel", onUp)
      detach.current = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.removeEventListener("pointercancel", onUp)
      }
    },
    [endGesture, handleMove, store]
  )

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.stopPropagation()
  }, [])

  const cancelMarquee = useCallback(() => {
    const current = gesture.current
    if (!current) return

    // Only a marquee that crossed the threshold ever touched the selection; below it the
    // gesture is still just a click and there is nothing to put back.
    if (current.active) {
      applySelection(current.from)
      // The pointer is still down. Its release will fire a click on the pane, and React
      // Flow answers that by clearing the selection we have just restored.
      swallowClick.current = true
    }
    endGesture()
  }, [applySelection, endGesture])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      // A marquee released *outside* the canvas produces no click on the pane, so its guard
      // would stay armed and eat an unrelated click later. Any fresh press spends it: a
      // guard may only ever swallow the click belonging to the release it was armed for.
      // Spent before the cancel below, which re-arms it when it abandons a live marquee.
      swallowClick.current = false

      // A *second* pointer landing mid-marquee means the gesture was never a marquee: it
      // is a pinch (React Flow zooms on pinch, and under `select` a one-finger drag on the
      // pane is ours, so the first finger of a pinch always lands here first). Ignoring the
      // foreign pointer is not enough — the first finger would keep drawing a rectangle
      // through the zoom — so the marquee is abandoned outright and the selection it started
      // from is put back. This listener runs on `window` in the capture phase, ahead of the
      // React handler that arms a gesture, so the press that *starts* a marquee finds no
      // gesture in flight and cannot cancel itself.
      const current = gesture.current
      if (current && event.pointerId !== current.pointerId) cancelMarquee()
    }

    window.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true })
      detach.current?.()
    }
  }, [cancelMarquee])

  return { rect, onPointerDownCapture, onClickCapture, cancelMarquee }
}

/**
 * Does the marquee touch this shape? An overlap, not containment — the spec selects
 * every shape the rectangle *intersects*, so clipping a corner is enough. Both are in
 * flow coordinates, and a node's `position` is its top-left corner.
 */
function intersects(node: CanvasNode, area: Rect): boolean {
  const width = node.measured?.width ?? 0
  const height = node.measured?.height ?? 0

  return (
    node.position.x < area.x + area.width &&
    node.position.x + width > area.x &&
    node.position.y < area.y + area.height &&
    node.position.y + height > area.y
  )
}
