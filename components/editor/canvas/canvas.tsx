"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
import { useUpdateMyPresence } from "@liveblocks/react/suspense"
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react"

import {
  cloneTemplateGraph,
  type CanvasTemplate,
} from "@/components/editor/starter-templates"
import { StarterTemplatesModal } from "@/components/editor/starter-templates-modal"
import { useStarterTemplates } from "@/components/editor/starter-templates-context"
import { useCanvasAutosave } from "@/hooks/use-canvas-autosave"
import { useCanvasDeleteKeys } from "@/hooks/use-canvas-delete-keys"
import { useCanvasMarquee } from "@/hooks/use-canvas-marquee"
import { useCanvasTool } from "@/hooks/use-canvas-tool"
import { ZOOM_DURATION } from "@/hooks/useKeyboardShortcuts"
import { createCanvasEdge } from "@/lib/canvas-edge"
import { createCanvasNode } from "@/lib/canvas-node"
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  DEFAULT_CANVAS_TOOL,
  DEFAULT_EDGE_OPTIONS,
  NODE_SHAPE_BY_NAME,
  SHAPE_DRAG_MIME,
  isShapeTool,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSnapshot,
  type CanvasTool,
  type ShapeDragPayload,
} from "@/types/canvas"

import { CanvasNodeRenderer } from "./canvas-node"
import { CanvasEdgeRenderer } from "./canvas-edge"
import { CanvasActionsProvider } from "./canvas-context"
import { useCanvasGraph } from "./canvas-graph-context"
import { useCanvasSave } from "./canvas-save-context"
import { CanvasToolProvider } from "./canvas-tool-context"
import { AiActivityBridge } from "./ai-activity-bridge"
import { AiStatusFeed } from "./ai-status-feed"
import { CanvasControls } from "./canvas-controls"
import { LiveCursors } from "./live-cursors"
import { PresenceAvatars } from "./presence-avatars"
import { RemoteSelectionProvider } from "./remote-selection-context"
import { ToolPanel } from "./tool-panel"

import "@xyflow/react/dist/style.css"
import "@liveblocks/react-flow/styles.css"

/**
 * The React Flow canvas, wired to Liveblocks Storage via `useLiveblocksFlow`.
 * Nodes, edges, and change handlers are synced across every user in the room.
 * Rendered inside a `ClientSideSuspense` boundary, so it uses suspense mode and
 * `nodes`/`edges` are always ready arrays here.
 *
 * Wrapped in `ReactFlowProvider` so the drop handler can call `useReactFlow` to
 * convert dropped screen coordinates into canvas coordinates.
 */
export function Canvas({ projectId }: { projectId: string }) {
  return (
    <ReactFlowProvider>
      <CanvasFlow projectId={projectId} />
    </ReactFlowProvider>
  )
}

/**
 * The cursor a tool asks for. Eight tools, three cursors: all six shape tools
 * share the crosshair, so the CSS keys off the cursor rather than off the tool.
 */
function cursorGroup(tool: CanvasTool): "select" | "hand" | "shape" {
  if (isShapeTool(tool)) return "shape"
  return tool
}

function CanvasFlow({ projectId }: { projectId: string }) {
  const { nodes, edges, onNodesChange, onEdgesChange, onDelete } =
    useLiveblocksFlow<CanvasNode, CanvasEdge>({
      suspense: true,
      nodes: { initial: [] },
      edges: { initial: [] },
    })

  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>()
  const { screenToFlowPosition } = reactFlow
  const updateMyPresence = useUpdateMyPresence()
  const { isOpen: isTemplatesOpen, setOpen: setTemplatesOpen } =
    useStarterTemplates()
  const { setStatus, saveNowRef } = useCanvasSave()

  // Marquee selection: a drag from empty canvas draws a rectangle and selects every
  // shape it touches. Built before the tool hook, which is handed its `cancelMarquee`
  // so `Esc` — and any other tool switch — abandons a marquee mid-drag.
  const {
    rect: marqueeRect,
    onPointerDownCapture: onMarqueePointerDown,
    onClickCapture: onMarqueeClickCapture,
    cancelMarquee,
  } = useCanvasMarquee(onNodesChange, onEdgesChange)

  // The one active tool: it owns the canvas cursor and decides what a click on
  // the pane means. Also binds the V / H / R / Esc shortcuts.
  const { activeTool, selectTool } = useCanvasTool(cancelMarquee)

  // The select tool owns selection, move, resize, delete, and the marquee. Every one
  // of those gestures goes quiet while another tool owns the canvas — the existing
  // selection survives the switch, it just stops responding.
  const isSelectTool = activeTool === "select"

  // The hand tool owns the drag: every drag pans, wherever it starts. It is the one
  // tool that also gives up *connectors*, so that dragging off a shape's edge pans
  // rather than pulling a connection out of it. `hand` is also what hold-space
  // activates, so all of this holds for the duration of the key too.
  const isHandTool = activeTool === "hand"

  // Keep the sidebar's view of the graph current, so "Generate Spec" describes
  // the canvas as it stands. A ref, not state: this changes on every drag, and
  // nothing renders from it (see `canvas-graph-context.ts`).
  const { graphRef } = useCanvasGraph()
  useEffect(() => {
    graphRef.current = { nodes, edges }
  }, [nodes, edges, graphRef])

  // Delete / Backspace removes the selected nodes and edges through the shared
  // Liveblocks state so it syncs to everyone (RF's own keyboard deletion is
  // disabled via `deleteKeyCode={null}` below), and only while `select` is active.
  useCanvasDeleteKeys(onDelete, isSelectTool)

  // Gate autosave until the initial load decision is made, so loading saved
  // state (or the empty starting graph) never triggers a save on its own.
  const [hydrated, setHydrated] = useState(false)

  // Latest graph + handlers, read inside the run-once load effect so it never
  // needs to re-run (and never overwrites active edits with stale closures).
  // Synced in an effect so the post-fetch "still empty" re-check sees committed
  // state — catching a collaborator who added nodes while the fetch was in air.
  const loadRef = useRef({ nodes, edges, onNodesChange, onEdgesChange, reactFlow })
  useEffect(() => {
    loadRef.current = { nodes, edges, onNodesChange, onEdgesChange, reactFlow }
  })
  const hasLoadedRef = useRef(false)

  // On first mount: if the room already has content, skip loading so active
  // collaboration is never overwritten. Otherwise fetch the saved snapshot and,
  // only while the room is still empty, add it to the shared graph.
  useEffect(() => {
    if (hasLoadedRef.current) return
    hasLoadedRef.current = true

    if (loadRef.current.nodes.length > 0 || loadRef.current.edges.length > 0) {
      setHydrated(true)
      // Room already has content (e.g. a reconnect): fit it into view once.
      // The declarative `fitView` prop is intentionally not used — it defers its
      // initial fit to the first node drop on an empty canvas, causing an
      // unwanted zoom-in. Fitting here (and after a load) covers the populated
      // cases without that side effect; a truly empty canvas gets no auto-fit.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void loadRef.current.reactFlow.fitView({ duration: ZOOM_DURATION })
        })
      })
      return
    }

    let cancelled = false
    async function loadSavedCanvas() {
      try {
        const response = await fetch(`/api/projects/${projectId}/canvas`)
        if (!response.ok) {
          throw new Error(`Canvas load failed (${response.status})`)
        }
        const { canvas } = (await response.json()) as {
          canvas: CanvasSnapshot | null
        }

        const current = loadRef.current
        const roomStillEmpty =
          current.nodes.length === 0 && current.edges.length === 0
        const hasSaved =
          canvas !== null &&
          (canvas.nodes.length > 0 || canvas.edges.length > 0)

        if (!cancelled && roomStillEmpty && hasSaved) {
          current.onNodesChange(
            canvas.nodes.map((item) => ({ type: "add", item }))
          )
          current.onEdgesChange(
            canvas.edges.map((item) => ({ type: "add", item }))
          )
          // Wait for the added nodes to reach React Flow's store before fitting.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              void loadRef.current.reactFlow.fitView({ duration: ZOOM_DURATION })
            })
          })
        }
      } catch (error) {
        console.error(error)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }

    void loadSavedCanvas()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Debounced autosave of the live graph, reported up to the navbar indicator.
  const { status: saveStatus, saveNow } = useCanvasAutosave({
    projectId,
    nodes,
    edges,
    enabled: hydrated,
  })

  useEffect(() => {
    setStatus(saveStatus)
  }, [saveStatus, setStatus])

  useEffect(() => {
    saveNowRef.current = saveNow
    return () => {
      saveNowRef.current = null
    }
  }, [saveNow, saveNowRef])

  const nodeTypes = useMemo<NodeTypes>(
    () => ({ [CANVAS_NODE_TYPE]: CanvasNodeRenderer }),
    []
  )

  const edgeTypes = useMemo<EdgeTypes>(
    () => ({ [CANVAS_EDGE_TYPE]: CanvasEdgeRenderer }),
    []
  )

  // Commit node and edge edits through the synced change flow (a `"replace"`
  // change carries the full element so Liveblocks reconciles it into Storage),
  // keeping label and color edits collaborative rather than local-only.
  const canvasActions = useMemo(
    () => ({
      updateNodeLabel: (id: string, label: string) => {
        const node = nodes.find((current) => current.id === id)
        if (!node) return
        onNodesChange([
          {
            type: "replace",
            id,
            item: { ...node, data: { ...node.data, label } },
          },
        ])
      },
      updateNodeColor: (id: string, color: string, textColor: string) => {
        const node = nodes.find((current) => current.id === id)
        if (!node) return
        onNodesChange([
          {
            type: "replace",
            id,
            item: { ...node, data: { ...node.data, color, textColor } },
          },
        ])
      },
      updateEdgeLabel: (id: string, label: string) => {
        const edge = edges.find((current) => current.id === id)
        if (!edge) return
        onEdgesChange([
          {
            type: "replace",
            id,
            item: { ...edge, data: { ...edge.data, label } },
          },
        ])
      },
    }),
    [nodes, edges, onNodesChange, onEdgesChange]
  )

  // Build each new connection into a full canvas edge (custom type, arrowhead,
  // light stroke) and add it through the synced edge-change flow, since
  // Liveblocks' own `onConnect` does not apply `defaultEdgeOptions`.
  const handleConnect = useCallback(
    (connection: Connection) => {
      onEdgesChange([{ type: "add", item: createCanvasEdge(connection) }])
    },
    [onEdgesChange]
  )

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()

      const raw = event.dataTransfer.getData(SHAPE_DRAG_MIME)
      if (!raw) return

      let payload: ShapeDragPayload
      try {
        payload = JSON.parse(raw) as ShapeDragPayload
      } catch {
        return
      }

      // The drag ghost is centered under the cursor (its hotspot is the shape's
      // center), and React Flow node `position` is the top-left corner — so
      // offset by half the node size to drop the node's center where the cursor
      // is. Without this the node would jump down-and-right of the ghost.
      const point = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const position = {
        x: point.x - payload.size.width / 2,
        y: point.y - payload.size.height / 2,
      }
      const node = createCanvasNode(payload.shape, payload.size, position)

      onNodesChange([{ type: "add", item: node }])
    },
    [onNodesChange, screenToFlowPosition]
  )

  // While a shape tool is active, a click on the canvas places that shape and the
  // canvas returns to `select`. The node is centered on the click point, the same
  // hotspot the drag-and-drop path above uses, so both feel identical.
  //
  // `selected: true` is what makes the placed shape the selection. It is safe to
  // set here because `selected` is local-only in the Liveblocks node config — it
  // never reaches Storage, so this selects the node for the person who placed it
  // and for nobody else, exactly as clicking it would.
  //
  // Clearing the *previous* selection is done here, explicitly, rather than left to
  // React Flow's pane-click reset. That reset is a no-op while a shape tool is active
  // — nothing is selectable then, deliberately, so that clicking a shape under a shape
  // tool cannot select it — and leaning on it would leave every shape placed in a row
  // selected together.
  const handlePaneClick = useCallback(
    (event: MouseEvent) => {
      if (!isShapeTool(activeTool)) return

      const { defaultSize } = NODE_SHAPE_BY_NAME[activeTool]
      const point = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const node = createCanvasNode(activeTool, defaultSize, {
        x: point.x - defaultSize.width / 2,
        y: point.y - defaultSize.height / 2,
      })

      onNodesChange([
        ...nodes
          .filter((current) => current.selected)
          .map((current) => ({
            id: current.id,
            type: "select" as const,
            selected: false,
          })),
        { type: "add", item: { ...node, selected: true } },
      ])
      const selectedEdges = edges.filter((edge) => edge.selected)
      if (selectedEdges.length > 0) {
        onEdgesChange(
          selectedEdges.map((edge) => ({
            id: edge.id,
            type: "select" as const,
            selected: false,
          }))
        )
      }

      selectTool(DEFAULT_CANVAS_TOOL)
    },
    [
      activeTool,
      edges,
      nodes,
      onEdgesChange,
      onNodesChange,
      screenToFlowPosition,
      selectTool,
    ]
  )

  // Broadcast the local cursor as flow coordinates so it stays anchored to the
  // canvas content for every viewer regardless of their pan/zoom. Cleared to
  // null when the pointer leaves the canvas so stale cursors don't linger.
  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      updateMyPresence({ cursor: { x: position.x, y: position.y } })
    },
    [screenToFlowPosition, updateMyPresence]
  )

  const handleMouseLeave = useCallback(() => {
    updateMyPresence({ cursor: null })
  }, [updateMyPresence])

  // Broadcast what this user has selected. Selection is deliberately not part of
  // the synced graph — `@liveblocks/react-flow` pins `selected: false` in its
  // node/edge config so one user's selection can never clobber another's — so it
  // travels through presence instead, and clears itself on disconnect.
  const handleSelectionChange = useCallback(
    ({
      nodes: selectedNodes,
      edges: selectedEdges,
    }: {
      nodes: CanvasNode[]
      edges: CanvasEdge[]
    }) => {
      if (selectedNodes.length === 0 && selectedEdges.length === 0) {
        updateMyPresence({ selection: null })
        return
      }

      updateMyPresence({
        selection: {
          nodes: selectedNodes.map((node) => node.id),
          edges: selectedEdges.map((edge) => edge.id),
        },
      })
    },
    [updateMyPresence]
  )

  // Replace the canvas with a starter template: clear the current graph, add the
  // template's nodes and edges, then fit the new graph into view. Liveblocks'
  // change handlers treat `"remove"` as a no-op (deletion happens through
  // `onDelete`), so the existing graph is cleared via `onDelete` before the
  // template's `"add"` changes are applied — the template replaces the canvas
  // rather than layering on top. All mutations stay in the collaborative state.
  const importTemplate = useCallback(
    (template: CanvasTemplate) => {
      if (nodes.length > 0 || edges.length > 0) {
        onDelete({ nodes, edges })
      }

      const graph = cloneTemplateGraph(template)
      onNodesChange(graph.nodes.map((item) => ({ type: "add", item })))
      onEdgesChange(graph.edges.map((item) => ({ type: "add", item })))

      // Wait for the new nodes to reach React Flow's store before fitting.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void reactFlow.fitView({ duration: ZOOM_DURATION })
        })
      })
    },
    [nodes, edges, onDelete, onNodesChange, onEdgesChange, reactFlow]
  )

  return (
    <div
      className="relative h-full w-full"
      // The active tool owns the canvas cursor: arrow for `select`, an open (and
      // while panning, closed) hand for `hand`, a crosshair for any shape tool.
      // Driven from CSS in `globals.css` rather than a Tailwind class, because the
      // rule has to out-specify React Flow's own `.react-flow__pane.draggable`
      // cursor — and because scoping it to the *pane* is what leaves the connector
      // crosshair on a node handle intact, whatever the active tool is.
      data-canvas-tool={cursorGroup(activeTool)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // A drag on empty canvas only means "marquee" under `select`; every other tool
      // declines the gesture simply by not arming it. The click guard stays wired up
      // regardless, so a marquee abandoned by a mid-drag tool switch still swallows
      // the click its release leaves behind.
      onPointerDownCapture={isSelectTool ? onMarqueePointerDown : undefined}
      onClickCapture={onMarqueeClickCapture}
    >
      {/* Publishes the active tool to the renderers inside the flow — a node's resize
       * handles are a select-tool gesture and go quiet under any other tool. */}
      <CanvasToolProvider value={activeTool}>
        <CanvasActionsProvider value={canvasActions}>
          {/* Wraps the flow so node and edge renderers can show who else has them
           * selected, from a single shared presence subscription. */}
          <RemoteSelectionProvider>
            <ReactFlow<CanvasNode, CanvasEdge>
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onDelete={onDelete}
              onPaneClick={handlePaneClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onSelectionChange={handleSelectionChange}
              connectionMode={ConnectionMode.Loose}
              colorMode="dark"
              deleteKeyCode={null}
              // Selecting, moving and resizing belong to the select tool. Turning both
              // off elsewhere is also what keeps the current selection alive across a
              // tool switch: React Flow's `resetSelectedElements` is a no-op while
              // nothing is selectable, so a pane click under another tool cannot clear
              // it. Connecting is left on throughout — creating a connector from a
              // shape edge is unaffected by the active tool.
              elementsSelectable={isSelectTool}
              nodesDraggable={isSelectTool}
              // Connectors are the last thing a node still answers to, and the hand
              // tool gives them up as well: every other tool keeps them (a shape tool
              // can still pull an edge out of a shape), but under `hand` a drag off a
              // shape's edge has to pan. Turning this off is also what silences the
              // connector *cursor* on a handle — React Flow only marks a handle
              // `connectionindicator` (the class carrying `pointer-events: all` and
              // `cursor: crosshair`) while its node is connectable, so with it off the
              // handle stops being a hit target and the pane's open hand shows through.
              nodesConnectable={!isHandTool}
              // Under `select`, dragging the empty canvas draws the marquee instead of
              // panning; every other tool keeps the drag-to-pan it already had. That
              // trade is what makes the marquee possible at all, so panning moves to
              // the hand tool and to scroll.
              panOnDrag={!isSelectTool}
              // React Flow binds space to pan on its own (`panActivationKeyCode`
              // defaults to `'Space'`, OR-ed into `panOnDrag`), and that has to go:
              // hold-space is a *tool* switch here, so the toolbar, the cursor and
              // every gesture gate follow from it. Left on, the two would disagree —
              // React Flow would happily pan on a space-held drag under `select` while
              // the tool state still said `select`, and the marquee would draw at the
              // same time. `useCanvasTool` is the one owner of space.
              panActivationKeyCode={null}
              // Scroll and trackpad now pan rather than zoom, which is what keeps the
              // canvas navigable once `select` gives up drag-to-pan. Pinch and the zoom
              // activation key (Cmd/Ctrl + scroll) still zoom.
              panOnScroll
              // React Flow's own shift-drag marquee is off: shift is the *add to
              // selection* modifier here, for both a click and a marquee, and leaving
              // its marquee bound to shift would swallow the shift-click on a shape
              // before it ever reached the node.
              selectionKeyCode={null}
              multiSelectionKeyCode="Shift"
            >
              {/* Colors are raw strings because React Flow props can't take Tailwind
               * tokens; values mirror the ui-context palette (base/surface/border). */}
              <Background variant={BackgroundVariant.Dots} color="#2a2a30" />
              <LiveCursors />
            </ReactFlow>
          </RemoteSelectionProvider>
        </CanvasActionsProvider>
      </CanvasToolProvider>
      {/* The marquee. Above the shapes, and below the toolbars — they carry the same
       * `z-10` and come after it in source. A translucent brand fill bordered in the
       * selection outline color, so it reads as "this is what will be selected". */}
      {marqueeRect && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10 border border-brand bg-accent-dim"
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.width,
            height: marqueeRect.height,
          }}
        />
      )}
      {/* Reports shared AI status/presence up to the sidebar (outside the room). */}
      <AiActivityBridge />
      <AiStatusFeed />
      <PresenceAvatars />
      <CanvasControls />
      <ToolPanel activeTool={activeTool} onSelectTool={selectTool} />
      <StarterTemplatesModal
        open={isTemplatesOpen}
        onOpenChange={setTemplatesOpen}
        onImport={importTemplate}
      />
    </div>
  )
}
