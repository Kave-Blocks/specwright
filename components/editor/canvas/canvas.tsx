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
import { ZOOM_DURATION } from "@/hooks/useKeyboardShortcuts"
import { createCanvasEdge } from "@/lib/canvas-edge"
import { createCanvasNode } from "@/lib/canvas-node"
import {
  CANVAS_EDGE_TYPE,
  CANVAS_NODE_TYPE,
  DEFAULT_EDGE_OPTIONS,
  SHAPE_DRAG_MIME,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSnapshot,
  type ShapeDragPayload,
} from "@/types/canvas"

import { CanvasNodeRenderer } from "./canvas-node"
import { CanvasEdgeRenderer } from "./canvas-edge"
import { CanvasActionsProvider } from "./canvas-context"
import { useCanvasSave } from "./canvas-save-context"
import { CanvasControls } from "./canvas-controls"
import { LiveCursors } from "./live-cursors"
import { PresenceAvatars } from "./presence-avatars"
import { ShapePanel } from "./shape-panel"

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

  // Delete / Backspace removes the selected nodes and edges through the shared
  // Liveblocks state so it syncs to everyone (RF's own keyboard deletion is
  // disabled via `deleteKeyCode={null}` below).
  useCanvasDeleteKeys(onDelete)

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
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <CanvasActionsProvider value={canvasActions}>
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
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          connectionMode={ConnectionMode.Loose}
          colorMode="dark"
          deleteKeyCode={null}
        >
          {/* Colors are raw strings because React Flow props can't take Tailwind
           * tokens; values mirror the ui-context palette (base/surface/border). */}
          <Background variant={BackgroundVariant.Dots} color="#2a2a30" />
          <LiveCursors />
        </ReactFlow>
      </CanvasActionsProvider>
      <PresenceAvatars />
      <CanvasControls />
      <ShapePanel />
      <StarterTemplatesModal
        open={isTemplatesOpen}
        onOpenChange={setTemplatesOpen}
        onImport={importTemplate}
      />
    </div>
  )
}
