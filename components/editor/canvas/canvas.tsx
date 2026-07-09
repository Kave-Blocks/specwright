"use client"

import { useCallback, useMemo, type DragEvent } from "react"
import { useLiveblocksFlow } from "@liveblocks/react-flow"
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
  type ShapeDragPayload,
} from "@/types/canvas"

import { CanvasNodeRenderer } from "./canvas-node"
import { CanvasEdgeRenderer } from "./canvas-edge"
import { CanvasActionsProvider } from "./canvas-context"
import { CanvasControls } from "./canvas-controls"
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
export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasFlow />
    </ReactFlowProvider>
  )
}

function CanvasFlow() {
  const { nodes, edges, onNodesChange, onEdgesChange, onDelete } =
    useLiveblocksFlow<CanvasNode, CanvasEdge>({
      suspense: true,
      nodes: { initial: [] },
      edges: { initial: [] },
    })

  const reactFlow = useReactFlow<CanvasNode, CanvasEdge>()
  const { screenToFlowPosition } = reactFlow
  const { isOpen: isTemplatesOpen, setOpen: setTemplatesOpen } =
    useStarterTemplates()

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

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const node = createCanvasNode(payload.shape, payload.size, position)

      onNodesChange([{ type: "add", item: node }])
    },
    [onNodesChange, screenToFlowPosition]
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
          connectionMode={ConnectionMode.Loose}
          colorMode="dark"
          fitView
        >
          {/* Colors are raw strings because React Flow props can't take Tailwind
           * tokens; values mirror the ui-context palette (base/surface/border). */}
          <Background variant={BackgroundVariant.Dots} color="#2a2a30" />
        </ReactFlow>
      </CanvasActionsProvider>
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
